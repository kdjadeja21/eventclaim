import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "@/lib/audit";
import { Attendee, Coupon } from "@/lib/types";
import { nanoid } from "nanoid";

/**
 * Assigns one available coupon to the given attendee using a Firestore
 * transaction (prevents race conditions / double assignments).
 *
 * Returns true if a coupon was assigned, false if none available.
 */
export async function assignCouponToAttendee(
  eventId: string,
  attendeeId: string
): Promise<boolean> {
  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  const couponsRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons");

  const availableQuery = await couponsRef
    .where("status", "==", "available")
    .limit(20)
    .get();

  const candidates = availableQuery.docs.filter(
    (d) => !(d.data() as Coupon).isDisabled
  );

  if (candidates.length === 0) return false;

  return adminDb.runTransaction(async (txn) => {
    const attendeeSnap = await txn.get(attendeeRef);
    if (!attendeeSnap.exists) throw new Error("Attendee not found");

    const attendee = attendeeSnap.data()!;
    // Already assigned — idempotent
    if (attendee.couponId) return true;
    // Blacklisted attendees are not eligible for coupons
    if (attendee.isBlacklisted) return false;

    for (const couponDoc of candidates) {
      const couponRef = couponsRef.doc(couponDoc.id);
      const couponSnap = await txn.get(couponRef);
      if (!couponSnap.exists) continue;

      const coupon = couponSnap.data() as Coupon;
      if (coupon.status !== "available" || coupon.isDisabled) continue;

      const now = new Date().toISOString();
      const claimToken = nanoid(32);

      txn.update(couponRef, {
        assignedTo: attendeeId,
        status: "assigned",
        assignedAt: now,
      });

      txn.update(attendeeRef, {
        couponId: couponDoc.id,
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

      return true;
    }

    return false;
  }).then(async (assigned) => {
    if (assigned) {
      await writeAuditLog({
        eventId,
        action: "coupon_assigned",
        metadata: { attendeeId },
      });
    }
    return assigned;
  });
}

/**
 * Processes the reservation queue: assigns coupons to all attendees in the
 * event that are still waiting for one. Called after coupon upload or
 * attendee import.
 */
export async function assignPendingForEvent(eventId: string): Promise<number> {
  const attendeesSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .where("couponId", "==", null)
    .get();

  // Sort: checked-in attendees first (asc checkedInAt),
  // then non-checked-in attendees (asc registeredAt).
  const sorted = attendeesSnap.docs
    .filter((d) => !(d.data() as Attendee).isBlacklisted)
    .slice()
    .sort((a, b) => {
    const aData = a.data() as Attendee;
    const bData = b.data() as Attendee;
    const aChecked = aData.checkedInAt ?? null;
    const bChecked = bData.checkedInAt ?? null;

    // Both checked in → compare checkedInAt ascending
    if (aChecked && bChecked) return aChecked.localeCompare(bChecked);
    // Only a checked in → a comes first
    if (aChecked) return -1;
    // Only b checked in → b comes first
    if (bChecked) return 1;
    // Neither checked in → compare registeredAt ascending (null sorts last)
    const aReg = aData.registeredAt ?? aData.createdAt;
    const bReg = bData.registeredAt ?? bData.createdAt;
    return aReg.localeCompare(bReg);
  });

  let assigned = 0;
  for (const doc of sorted) {
    const ok = await assignCouponToAttendee(eventId, doc.id);
    if (ok) assigned++;
    else break; // no more coupons available
  }
  return assigned;
}

// Suppress unused import warning for FieldValue (used in other callers)
void FieldValue;
