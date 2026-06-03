import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "@/lib/audit";
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

  return adminDb.runTransaction(async (txn) => {
    const attendeeSnap = await txn.get(attendeeRef);
    if (!attendeeSnap.exists) throw new Error("Attendee not found");

    const attendee = attendeeSnap.data()!;
    // Already assigned — idempotent
    if (attendee.couponId) return true;

    // Find one available coupon
    const availableQuery = await couponsRef
      .where("status", "==", "available")
      .limit(1)
      .get();

    if (availableQuery.empty) return false;

    const couponDoc = availableQuery.docs[0];
    const couponRef = couponsRef.doc(couponDoc.id);

    // Re-read inside transaction to prevent race condition
    const couponSnap = await txn.get(couponRef);
    if (!couponSnap.exists || couponSnap.data()!.status !== "available") {
      return false;
    }

    const now = new Date().toISOString();
    const claimToken = nanoid(32);

    // Update coupon
    txn.update(couponRef, {
      assignedTo: attendeeId,
      status: "assigned",
      assignedAt: now,
    });

    // Update attendee
    txn.update(attendeeRef, {
      couponId: couponDoc.id,
      couponLink: couponSnap.data()!.couponLink,
      claimToken,
      emailStatus: "pending",
    });

    // Write claim token lookup
    const tokenRef = adminDb.collection("claimTokens").doc(claimToken);
    txn.set(tokenRef, {
      token: claimToken,
      eventId,
      attendeeId,
      createdAt: now,
    });

    return true;
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

  let assigned = 0;
  for (const doc of attendeesSnap.docs) {
    const ok = await assignCouponToAttendee(eventId, doc.id);
    if (ok) assigned++;
    else break; // no more coupons available
  }
  return assigned;
}

// Suppress unused import warning for FieldValue (used in other callers)
void FieldValue;
