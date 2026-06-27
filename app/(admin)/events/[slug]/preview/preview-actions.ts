"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { Attendee, Coupon } from "@/lib/types";

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
      .where("isDisabled", "==", false)
      .get(),
  ]);

  const enabledCouponCount = couponsSnap.size;

  // For uniqueLink coupons, check if any have an empty pool
  const uniqueLinkCoupons = couponsSnap.docs
    .map((d) => d.data() as Coupon)
    .filter((c) => c.kind === "uniqueLink");

  const poolExhausted = uniqueLinkCoupons.some(
    (c) => (c.linkAvailable ?? 0) === 0
  );

  let emailsToSend = 0;
  let emailsFailed = 0;
  let attendeesWithGrants = 0;
  let attendeesWithoutGrants = 0;

  for (const doc of attendeesSnap.docs) {
    const d = doc.data() as Attendee;
    if (d.isBlacklisted) continue;
    if ((d.grantCount ?? 0) > 0) {
      attendeesWithGrants++;
      if (d.emailStatus === "pending") emailsToSend++;
      if (d.emailStatus === "failed") emailsFailed++;
    } else {
      attendeesWithoutGrants++;
    }
  }

  const totalAttendees = attendeesSnap.size;
  const canSend = attendeesWithoutGrants === 0 && enabledCouponCount > 0 && !poolExhausted;

  return {
    eventId,
    totalAttendees,
    enabledCouponCount,
    attendeesWithGrants,
    attendeesWithoutGrants,
    poolExhausted,
    emailsToSend,
    emailsFailed,
    canSend,
  };
}
