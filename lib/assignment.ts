import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "@/lib/audit";
import { autoSendEmailIfEnabled } from "@/lib/auto-send";
import { Attendee, Coupon, CouponLink, Event, Grant } from "@/lib/types";
import { ensureClaimToken } from "@/lib/assignment-helpers";

export { ensureClaimToken };

/**
 * Grants a single coupon definition to the given attendee.
 * - uniqueLink: reserves one available pool link in a transaction.
 * - sharedCode / sharedLink: copies the sharedValue directly.
 * Idempotent: if the attendee already has a grant for this coupon, does nothing.
 * Returns true if a new grant was created, false if skipped.
 */
async function grantOneCoupon(
  eventId: string,
  attendeeId: string,
  coupon: Coupon
): Promise<boolean> {
  const grantRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId)
    .collection("grants")
    .doc(coupon.id); // coupon id = grant id → idempotent

  if (coupon.kind === "uniqueLink") {
    const linksRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("coupons")
      .doc(coupon.id)
      .collection("links");

    const couponRef = adminDb
      .collection("events")
      .doc(eventId)
      .collection("coupons")
      .doc(coupon.id);

    // Find available links first (outside transaction to avoid reads + writes
    // on very large collections; we re-verify inside the txn).
    const availableSnap = await linksRef
      .where("status", "==", "available")
      .limit(10)
      .get();

    if (availableSnap.empty) return false; // pool exhausted

    return adminDb.runTransaction(async (txn) => {
      const grantSnap = await txn.get(grantRef);
      if (grantSnap.exists) return false; // already granted — idempotent

      for (const linkDoc of availableSnap.docs) {
        const linkRef = linksRef.doc(linkDoc.id);
        const freshLink = await txn.get(linkRef);
        if (!freshLink.exists) continue;
        const link = freshLink.data() as CouponLink;
        if (link.status !== "available") continue;

        const now = new Date().toISOString();
        const grant: Grant = {
          couponId: coupon.id,
          eventId,
          attendeeId,
          value: link.url,
          linkId: link.id,
          status: "assigned",
          assignedAt: now,
          claimedAt: null,
        };

        txn.set(grantRef, grant);
        txn.update(linkRef, {
          status: "assigned",
          assignedTo: attendeeId,
          assignedAt: now,
        });
        // Decrement linkAvailable on the coupon definition
        txn.update(couponRef, {
          linkAvailable: FieldValue.increment(-1),
        });
        return true;
      }
      return false;
    });
  }

  // sharedCode or sharedLink
  if (!coupon.sharedValue) return false;

  return adminDb.runTransaction(async (txn) => {
    const grantSnap = await txn.get(grantRef);
    if (grantSnap.exists) return false; // idempotent

    const now = new Date().toISOString();
    const grant: Grant = {
      couponId: coupon.id,
      eventId,
      attendeeId,
      value: coupon.sharedValue!,
      status: "assigned",
      assignedAt: now,
      claimedAt: null,
    };
    txn.set(grantRef, grant);
    return true;
  });
}

/**
 * Grants ALL enabled coupons for the event to the given attendee.
 * Issues a claimToken for the attendee if one doesn't exist yet.
 * Returns the number of coupons newly granted.
 */
export async function grantCouponsToAttendee(
  eventId: string,
  attendeeId: string,
  event?: Event
): Promise<number> {
  const attendeeSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId)
    .get();

  if (!attendeeSnap.exists) return 0;
  const attendee = attendeeSnap.data() as Attendee;
  if (attendee.isBlacklisted) return 0;

  const couponsSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .where("isDisabled", "==", false)
    .get();

  if (couponsSnap.empty) return 0;

  const coupons = couponsSnap.docs.map((d) => d.data() as Coupon);
  let newGrants = 0;

  for (const coupon of coupons) {
    const granted = await grantOneCoupon(eventId, attendeeId, coupon);
    if (granted) newGrants++;
  }

  if (newGrants > 0) {
    // Ensure the attendee has a claimToken
    await ensureClaimToken(eventId, attendeeId);

    // Update grantCount on the attendee doc
    await adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .doc(attendeeId)
      .update({
        grantCount: FieldValue.increment(newGrants),
        emailStatus: "pending",
      });

    await writeAuditLog({
      eventId,
      action: "coupon_granted",
      metadata: { attendeeId, newGrants },
    });

    if (event?.autoSendEmail) {
      await autoSendEmailIfEnabled(event, attendeeId);
    }
  }

  return newGrants;
}

/**
 * Grants all enabled coupons to every attendee in the event that is still
 * missing at least one grant (or is missing grants for newly added coupons).
 * Processes checked-in attendees first.
 */
export async function assignPendingForEvent(eventId: string): Promise<number> {
  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  const event = eventDoc.exists ? (eventDoc.data() as Event) : undefined;

  const attendeesSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .get();

  const sorted = attendeesSnap.docs
    .filter((d) => !(d.data() as Attendee).isBlacklisted)
    .sort((a, b) => {
      const aData = a.data() as Attendee;
      const bData = b.data() as Attendee;
      const aChecked = aData.checkedInAt ?? null;
      const bChecked = bData.checkedInAt ?? null;
      if (aChecked && bChecked) return aChecked.localeCompare(bChecked);
      if (aChecked) return -1;
      if (bChecked) return 1;
      const aReg = aData.registeredAt ?? aData.createdAt;
      const bReg = bData.registeredAt ?? bData.createdAt;
      return aReg.localeCompare(bReg);
    });

  let totalGranted = 0;
  for (const doc of sorted) {
    const count = await grantCouponsToAttendee(eventId, doc.id, event);
    totalGranted += count;
  }
  return totalGranted;
}
