"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { isAssignableCoupon, Coupon } from "@/lib/types";

export async function getPreviewStats(slug: string) {
  await requireSession();

  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");

  const eventId = eventSnap.docs[0].id;

  const [attendeesSnap, couponsSnap] = await Promise.all([
    adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .get(),
    adminDb
      .collection("events")
      .doc(eventId)
      .collection("coupons")
      .get(),
  ]);

  let couponsAssigned = 0;
  let couponsAvailable = 0;
  let emailsToSend = 0;
  let emailsFailed = 0;

  for (const doc of couponsSnap.docs) {
    const c = doc.data() as Coupon;
    if (isAssignableCoupon(c)) couponsAvailable++;
    if (c.status !== "available") couponsAssigned++;
  }

  let attendeesWithCoupon = 0;
  for (const doc of attendeesSnap.docs) {
    const d = doc.data();
    if (d.couponId) attendeesWithCoupon++;
    if (d.emailStatus === "pending" && d.couponId) emailsToSend++;
    if (d.emailStatus === "failed") emailsFailed++;
  }

  const totalAttendees = attendeesSnap.size;
  const missingCoupons = totalAttendees - attendeesWithCoupon;
  const canSend = missingCoupons === 0;

  return {
    eventId,
    totalAttendees,
    couponsAvailable,
    couponsAssigned,
    emailsToSend,
    emailsFailed,
    missingCoupons,
    canSend,
  };
}
