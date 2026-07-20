"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { getFriendlyFirestoreMessage } from "@/lib/firestore-errors";
import { Attendee, CouponLink, Grant } from "@/lib/types";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import { ensureClaimToken } from "@/lib/assignment-helpers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function linksRef(eventId: string, couponId: string) {
  return adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId)
    .collection("links");
}

function couponRef(eventId: string, couponId: string) {
  return adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId);
}

function grantRef(eventId: string, attendeeId: string, couponId: string) {
  return adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId)
    .collection("grants")
    .doc(couponId);
}

function attendeeRef(eventId: string, attendeeId: string) {
  return adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);
}

function detailPath(slug: string, couponId: string) {
  return `/events/${slug}/coupons/${couponId}`;
}

// ─── Auto-assign: pick the next available link for an attendee ────────────────

export async function autoAssignLink(
  eventId: string,
  couponId: string,
  attendeeId: string,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
  // Check attendee doesn't already have a grant
  const existingGrant = await grantRef(eventId, attendeeId, couponId).get();
  if (existingGrant.exists) {
    return { success: false, error: "Attendee already has a grant for this coupon." };
  }

  // Find available, non-disabled links
  const availableSnap = await linksRef(eventId, couponId)
    .where("status", "==", "available")
    .limit(10)
    .get();

  const candidateDocs = availableSnap.docs.filter(
    (d) => !(d.data() as CouponLink).isDisabled
  );

  if (candidateDocs.length === 0) {
    return { success: false, error: "No available links in pool." };
  }

  const assigned = await adminDb.runTransaction(async (txn) => {
    const grantSnap = await txn.get(grantRef(eventId, attendeeId, couponId));
    if (grantSnap.exists) return false;

    for (const linkDoc of candidateDocs) {
      const freshLink = await txn.get(linksRef(eventId, couponId).doc(linkDoc.id));
      if (!freshLink.exists) continue;
      const link = freshLink.data() as CouponLink;
      if (link.status !== "available" || link.isDisabled) continue;

      const now = new Date().toISOString();
      const grant: Grant = {
        couponId,
        eventId,
        attendeeId,
        value: link.url,
        linkId: link.id,
        status: "assigned",
        assignedAt: now,
        claimedAt: null,
      };

      txn.set(grantRef(eventId, attendeeId, couponId), grant);
      txn.update(linksRef(eventId, couponId).doc(link.id), {
        status: "assigned",
        assignedTo: attendeeId,
        assignedAt: now,
      });
      txn.update(couponRef(eventId, couponId), {
        linkAvailable: FieldValue.increment(-1),
      });
      return true;
    }
    return false;
  });

  if (!assigned) {
    return { success: false, error: "No available links could be reserved." };
  }

  await ensureClaimToken(eventId, attendeeId);
  await attendeeRef(eventId, attendeeId).update({
    grantCount: FieldValue.increment(1),
    emailStatus: "pending",
  });

  await writeAuditLog({
    eventId,
    action: "coupon_granted",
    metadata: { couponId, attendeeId, manual: false },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
  } catch (err) {
    return { success: false, error: getFriendlyFirestoreMessage(err) };
  }
}

// ─── Assign a specific link to an attendee ────────────────────────────────────

export async function assignSpecificLink(
  eventId: string,
  couponId: string,
  linkId: string,
  attendeeId: string,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
  const existingGrant = await grantRef(eventId, attendeeId, couponId).get();
  if (existingGrant.exists) {
    return { success: false, error: "Attendee already has a grant for this coupon." };
  }

  const assigned = await adminDb.runTransaction(async (txn) => {
    const grantSnap = await txn.get(grantRef(eventId, attendeeId, couponId));
    if (grantSnap.exists) return false;

    const linkSnap = await txn.get(linksRef(eventId, couponId).doc(linkId));
    if (!linkSnap.exists) return false;
    const link = linkSnap.data() as CouponLink;
    if (link.status !== "available" || link.isDisabled) return false;

    const now = new Date().toISOString();
    const grant: Grant = {
      couponId,
      eventId,
      attendeeId,
      value: link.url,
      linkId: link.id,
      status: "assigned",
      assignedAt: now,
      claimedAt: null,
    };

    txn.set(grantRef(eventId, attendeeId, couponId), grant);
    txn.update(linksRef(eventId, couponId).doc(linkId), {
      status: "assigned",
      assignedTo: attendeeId,
      assignedAt: now,
    });
    txn.update(couponRef(eventId, couponId), {
      linkAvailable: FieldValue.increment(-1),
    });
    return true;
  });

  if (!assigned) {
    return { success: false, error: "Link is no longer available." };
  }

  await ensureClaimToken(eventId, attendeeId);
  await attendeeRef(eventId, attendeeId).update({
    grantCount: FieldValue.increment(1),
    emailStatus: "pending",
  });

  await writeAuditLog({
    eventId,
    action: "coupon_granted",
    metadata: { couponId, attendeeId, linkId, manual: true },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
  } catch (err) {
    return { success: false, error: getFriendlyFirestoreMessage(err) };
  }
}

// ─── Unassign a link (release back to available pool) ─────────────────────────

export async function unassignLink(
  eventId: string,
  couponId: string,
  linkId: string,
  attendeeId: string,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
  const linkSnap = await linksRef(eventId, couponId).doc(linkId).get();
  if (!linkSnap.exists) return { success: false, error: "Link not found." };

  const link = linkSnap.data() as CouponLink;
  if (link.status === "claimed") {
    return { success: false, error: "Cannot unassign a claimed link." };
  }

  await adminDb.runTransaction(async (txn) => {
    txn.delete(grantRef(eventId, attendeeId, couponId));
    txn.update(linksRef(eventId, couponId).doc(linkId), {
      status: "available",
      assignedTo: null,
      assignedAt: null,
    });
    txn.update(couponRef(eventId, couponId), {
      linkAvailable: FieldValue.increment(1),
    });
    txn.update(attendeeRef(eventId, attendeeId), {
      grantCount: FieldValue.increment(-1),
    });
  });

  await writeAuditLog({
    eventId,
    action: "coupon_unassigned",
    metadata: { couponId, attendeeId, linkId },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
  } catch (err) {
    return { success: false, error: getFriendlyFirestoreMessage(err) };
  }
}

// ─── Delete a link from the pool (available only) ─────────────────────────────

export async function deleteLink(
  eventId: string,
  couponId: string,
  linkId: string,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
  const linkDocRef = linksRef(eventId, couponId).doc(linkId);
  const linkSnap = await linkDocRef.get();
  if (!linkSnap.exists) return { success: false, error: "Link not found." };

  const link = linkSnap.data() as CouponLink;
  if (link.status !== "available") {
    return { success: false, error: "Only available (unassigned) links can be deleted." };
  }

  await linkDocRef.delete();
  await couponRef(eventId, couponId).update({
    linkTotal: FieldValue.increment(-1),
    linkAvailable: FieldValue.increment(-1),
  });

  await writeAuditLog({
    eventId,
    action: "coupon_link_deleted",
    metadata: { couponId, linkId },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
  } catch (err) {
    return { success: false, error: getFriendlyFirestoreMessage(err) };
  }
}

// ─── Toggle a single link's disabled state ────────────────────────────────────

export async function toggleLinkDisabled(
  eventId: string,
  couponId: string,
  linkId: string,
  disabled: boolean,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
  const linkDocRef = linksRef(eventId, couponId).doc(linkId);
  const linkSnap = await linkDocRef.get();
  if (!linkSnap.exists) return { success: false, error: "Link not found." };

  await linkDocRef.update({ isDisabled: disabled });

  await writeAuditLog({
    eventId,
    action: disabled ? "coupon_disabled" : "coupon_enabled",
    metadata: { couponId, linkId },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
  } catch (err) {
    return { success: false, error: getFriendlyFirestoreMessage(err) };
  }
}

// ─── Bulk auto-assign: assign all available links to attendees without a grant ─

export async function bulkAutoAssignLinks(
  eventId: string,
  couponId: string,
  eventSlug: string
): Promise<{ success: boolean; assigned: number; error?: string }> {
  await requireSession();

  try {
    // Get all attendees who don't have a grant for this coupon
    const unassigned = await getUnassignedAttendees(eventId, couponId);
    if (unassigned.length === 0) {
      return { success: true, assigned: 0 };
    }

    let assigned = 0;
    for (const attendee of unassigned) {
      const res = await autoAssignLink(eventId, couponId, attendee.id, eventSlug);
      if (res.success) assigned++;
      else if (
        res.error === "No available links in pool." ||
        res.error === "No available links could be reserved."
      ) {
        break; // pool exhausted
      }
    }

    revalidatePath(detailPath(eventSlug, couponId));
    return { success: true, assigned };
  } catch (err) {
    return { success: false, assigned: 0, error: getFriendlyFirestoreMessage(err) };
  }
}

// ─── Data queries ─────────────────────────────────────────────────────────────

/** Attendees who have NO grant for this specific coupon and are not blacklisted. */
export async function getUnassignedAttendees(
  eventId: string,
  couponId: string
): Promise<Array<{ id: string; name: string; email: string }>> {
  await requireSession();

  // Get all attendees
  const attendeesSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .orderBy("name")
    .get();

  // Get all grants for this coupon
  const grantsSnap = await adminDb
    .collectionGroup("grants")
    .where("couponId", "==", couponId)
    .where("eventId", "==", eventId)
    .get();

  const grantedAttendeeIds = new Set(
    grantsSnap.docs.map((d) => (d.data() as Grant).attendeeId)
  );

  return attendeesSnap.docs
    .filter((d) => {
      const a = d.data() as Attendee;
      return !a.isBlacklisted && !grantedAttendeeIds.has(d.id);
    })
    .map((d) => {
      const a = d.data() as Attendee;
      return { id: d.id, name: a.name, email: a.email };
    });
}

/** Available non-disabled links for the manual assign dropdown. */
export async function getAvailableLinks(
  eventId: string,
  couponId: string
): Promise<Array<{ id: string; url: string }>> {
  await requireSession();

  const snap = await linksRef(eventId, couponId)
    .where("status", "==", "available")
    .get();

  return snap.docs
    .filter((d) => !(d.data() as CouponLink).isDisabled)
    .map((d) => {
      const l = d.data() as CouponLink;
      return { id: l.id, url: l.url };
    });
}
