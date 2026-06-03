"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import {
  assignCouponToAttendee,
  assignPendingForEvent,
} from "@/lib/assignment";
import { parseCouponCsv, couponDocId } from "@/lib/import";
import { Attendee, Coupon } from "@/lib/types";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

// ─── Auto-assign next available coupon to an attendee ─────────────────────────

export async function autoAssignToAttendee(
  eventId: string,
  attendeeId: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  await requireSession();

  try {
    const assigned = await assignCouponToAttendee(eventId, attendeeId);
    if (!assigned) {
      return { success: false, error: "No available coupons to assign." };
    }
    revalidatePath(`/events/${slug}/coupons`);
    revalidatePath(`/events/${slug}/attendees`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Assignment failed.",
    };
  }
}

// ─── Manually pair a specific coupon to a specific attendee ───────────────────

export async function assignSpecificCoupon(
  eventId: string,
  couponId: string,
  attendeeId: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const couponRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId);

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  try {
    await adminDb.runTransaction(async (txn) => {
      const [couponSnap, attendeeSnap] = await Promise.all([
        txn.get(couponRef),
        txn.get(attendeeRef),
      ]);

      if (!couponSnap.exists) throw new Error("Coupon not found.");
      if (!attendeeSnap.exists) throw new Error("Attendee not found.");

      const coupon = couponSnap.data() as Coupon;
      const attendee = attendeeSnap.data() as Attendee;

      if (coupon.status !== "available") {
        throw new Error("Coupon is no longer available.");
      }
      if (attendee.couponId) {
        throw new Error("Attendee already has a coupon assigned.");
      }

      const now = new Date().toISOString();
      const claimToken = nanoid(32);

      txn.update(couponRef, {
        assignedTo: attendeeId,
        status: "assigned",
        assignedAt: now,
      });

      txn.update(attendeeRef, {
        couponId,
        couponLink: coupon.couponLink,
        claimToken,
        emailStatus: "pending",
      });

      const tokenRef = adminDb.collection("claimTokens").doc(claimToken);
      txn.set(tokenRef, {
        token: claimToken,
        eventId,
        attendeeId,
        createdAt: now,
      });
    });

    await writeAuditLog({
      eventId,
      action: "coupon_assigned",
      metadata: { couponId, attendeeId, manual: true },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/coupons`);
    revalidatePath(`/events/${slug}/attendees`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Assignment failed.",
    };
  }
}

// ─── Unassign a coupon (revert to available) ──────────────────────────────────

export async function unassignCoupon(
  eventId: string,
  couponId: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const couponRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId);

  try {
    let unassignedAttendeeId: string | null = null;

    await adminDb.runTransaction(async (txn) => {
      const couponSnap = await txn.get(couponRef);
      if (!couponSnap.exists) throw new Error("Coupon not found.");

      const coupon = couponSnap.data() as Coupon;
      if (coupon.status === "available") {
        throw new Error("Coupon is already unassigned.");
      }
      if (coupon.status === "claimed") {
        throw new Error("Claimed coupons cannot be unassigned.");
      }

      unassignedAttendeeId = coupon.assignedTo;

      // Revert coupon
      txn.update(couponRef, {
        assignedTo: null,
        status: "available",
        assignedAt: null,
        claimedAt: null,
      });

      // Revert attendee if linked
      if (coupon.assignedTo) {
        const attendeeRef = adminDb
          .collection("events")
          .doc(eventId)
          .collection("attendees")
          .doc(coupon.assignedTo);

        const attendeeSnap = await txn.get(attendeeRef);
        if (attendeeSnap.exists) {
          const attendee = attendeeSnap.data() as Attendee;

          // Delete the claim token if it exists
          if (attendee.claimToken) {
            const tokenRef = adminDb
              .collection("claimTokens")
              .doc(attendee.claimToken);
            txn.delete(tokenRef);
          }

          txn.update(attendeeRef, {
            couponId: null,
            couponLink: null,
            claimToken: null,
            emailStatus: "pending",
            claimed: false,
            claimedAt: null,
          });
        }
      }
    });

    await writeAuditLog({
      eventId,
      action: "coupon_unassigned",
      metadata: { couponId, attendeeId: unassignedAttendeeId },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/coupons`);
    revalidatePath(`/events/${slug}/attendees`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unassign failed.",
    };
  }
}

// ─── Add new coupons by pasting raw links ─────────────────────────────────────

export async function addCoupons(
  eventId: string,
  rawText: string,
  slug: string
): Promise<{
  success: boolean;
  imported: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  autoAssigned: number;
  errors: string[];
  error?: string;
}> {
  const session = await requireSession();

  try {
    const { rows, duplicatesInFile, invalidCount, errors } =
      parseCouponCsv(rawText);

    let imported = 0;
    let duplicatesSkipped = duplicatesInFile;

    const couponsRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("coupons");

    for (const row of rows) {
      const docId = couponDocId(eventId, row.couponLink);
      const docRef = couponsRef.doc(docId);
      const existing = await docRef.get();

      if (existing.exists) {
        duplicatesSkipped++;
        continue;
      }

      const coupon: Coupon = {
        id: docId,
        eventId,
        couponLink: row.couponLink,
        assignedTo: null,
        status: "available",
        assignedAt: null,
        claimedAt: null,
      };

      await docRef.set(coupon);
      imported++;
    }

    await writeAuditLog({
      eventId,
      action: "coupon_added",
      metadata: { imported, duplicatesSkipped, invalid: invalidCount },
      userId: session.uid,
    });

    const autoAssigned = await assignPendingForEvent(eventId);

    revalidatePath(`/events/${slug}/coupons`);
    revalidatePath(`/events/${slug}/attendees`);

    return {
      success: true,
      imported,
      duplicatesSkipped,
      invalidSkipped: invalidCount,
      autoAssigned,
      errors,
    };
  } catch (err) {
    return {
      success: false,
      imported: 0,
      duplicatesSkipped: 0,
      invalidSkipped: 0,
      autoAssigned: 0,
      errors: [],
      error: err instanceof Error ? err.message : "Failed to add coupons.",
    };
  }
}

// ─── Delete an unassigned coupon ──────────────────────────────────────────────

export async function deleteCoupon(
  eventId: string,
  couponId: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  await requireSession();

  try {
    const couponRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("coupons")
      .doc(couponId);

    const snap = await couponRef.get();
    if (!snap.exists) return { success: false, error: "Coupon not found." };

    const coupon = snap.data() as Coupon;
    if (coupon.status !== "available") {
      return {
        success: false,
        error: "Only unassigned (available) coupons can be deleted.",
      };
    }

    await couponRef.delete();
    revalidatePath(`/events/${slug}/coupons`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delete failed.",
    };
  }
}

// ─── Bulk assign all pending attendees ────────────────────────────────────────

export async function bulkAutoAssignPending(
  eventId: string,
  slug: string
): Promise<{ success: boolean; assigned: number; error?: string }> {
  await requireSession();

  try {
    const assigned = await assignPendingForEvent(eventId);
    revalidatePath(`/events/${slug}/coupons`);
    revalidatePath(`/events/${slug}/attendees`);
    return { success: true, assigned };
  } catch (err) {
    return {
      success: false,
      assigned: 0,
      error: err instanceof Error ? err.message : "Bulk assign failed.",
    };
  }
}
