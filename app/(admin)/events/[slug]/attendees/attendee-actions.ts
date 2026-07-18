"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { grantCouponsToAttendee } from "@/lib/assignment";
import { Attendee, Event } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function toggleAttendeeBlacklist(
  eventId: string,
  attendeeId: string,
  blacklisted: boolean,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  try {
    const snap = await attendeeRef.get();
    if (!snap.exists) return { success: false, error: "Attendee not found." };

    const attendee = snap.data() as Attendee;
    if (blacklisted && attendee.claimedAny) {
      return {
        success: false,
        error: "Cannot blacklist an attendee who has already claimed their offers.",
      };
    }

    await attendeeRef.update({ isBlacklisted: blacklisted });

    await writeAuditLog({
      eventId,
      action: blacklisted ? "attendee_blacklisted" : "attendee_unblacklisted",
      metadata: { attendeeId, email: attendee.email },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/attendees`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Update failed.",
    };
  }
}

/**
 * Assigns every enabled coupon for the event to a single attendee in one
 * click — handy for quickly provisioning test attendees so they can be
 * exercised through the claim flow (and afterwards deleted again).
 */
export async function assignCouponsToAttendee(
  eventId: string,
  attendeeId: string,
  slug: string
): Promise<{ success: boolean; newGrants?: number; error?: string }> {
  await requireSession();

  try {
    const [eventSnap, attendeeSnap] = await Promise.all([
      adminDb.collection("events").doc(eventId).get(),
      adminDb
        .collection("events")
        .doc(eventId)
        .collection("attendees")
        .doc(attendeeId)
        .get(),
    ]);

    if (!eventSnap.exists) return { success: false, error: "Event not found." };
    if (!attendeeSnap.exists) return { success: false, error: "Attendee not found." };

    const attendee = attendeeSnap.data() as Attendee;
    if (attendee.isBlacklisted) {
      return {
        success: false,
        error: "Cannot assign coupons to a blacklisted attendee.",
      };
    }

    const event = eventSnap.data() as Event;
    const newGrants = await grantCouponsToAttendee(eventId, attendeeId, event);

    if (newGrants === 0) {
      return {
        success: false,
        error:
          (attendee.grantCount ?? 0) > 0
            ? "Attendee already has all available coupons."
            : "No coupons available to assign.",
      };
    }

    revalidatePath(`/events/${slug}/attendees`);
    return { success: true, newGrants };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Coupon assignment failed.",
    };
  }
}

/**
 * Bulk variant of {@link assignCouponsToAttendee} — assigns all enabled
 * coupons to each of the given attendees, skipping blacklisted attendees
 * and attendees who already have every coupon.
 */
export async function bulkAssignCoupons(
  eventId: string,
  attendeeIds: string[],
  slug: string
): Promise<{
  assigned: number;
  skipped: number;
  results: { attendeeId: string; newGrants: number }[];
}> {
  await requireSession();

  const eventSnap = await adminDb.collection("events").doc(eventId).get();
  if (!eventSnap.exists) throw new Error("Event not found.");
  const event = eventSnap.data() as Event;

  const attendeesRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees");

  let assigned = 0;
  let skipped = 0;
  const results: { attendeeId: string; newGrants: number }[] = [];

  const READ_CHUNK = 300;
  for (let i = 0; i < attendeeIds.length; i += READ_CHUNK) {
    const idsChunk = attendeeIds.slice(i, i + READ_CHUNK);
    const refs = idsChunk.map((id) => attendeesRef.doc(id));
    const docs = await adminDb.getAll(...refs);

    for (const doc of docs) {
      if (!doc.exists) {
        skipped++;
        continue;
      }
      const attendee = doc.data() as Attendee;
      if (attendee.isBlacklisted) {
        skipped++;
        continue;
      }

      const newGrants = await grantCouponsToAttendee(eventId, doc.id, event);
      if (newGrants > 0) {
        assigned++;
        results.push({ attendeeId: doc.id, newGrants });
      } else {
        skipped++;
      }
    }
  }

  if (assigned > 0) {
    await writeAuditLog({
      eventId,
      action: "coupon_granted",
      metadata: { bulk: true, attendeeCount: assigned },
    });
  }

  revalidatePath(`/events/${slug}/attendees`);
  return { assigned, skipped, results };
}
