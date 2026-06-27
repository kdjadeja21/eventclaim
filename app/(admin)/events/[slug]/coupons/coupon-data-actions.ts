"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import {
  Coupon,
  CouponLink,
  Grant,
  CouponWithStats,
} from "@/lib/types";

async function resolveEventId(slug: string): Promise<string> {
  const snap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) throw new Error(`Event not found: ${slug}`);
  return snap.docs[0].id;
}

export async function getCoupons(slug: string): Promise<{
  coupons: CouponWithStats[];
  eventId: string;
}> {
  await requireSession();
  const eventId = await resolveEventId(slug);

  const couponsSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .orderBy("sortOrder")
    .get();

  const coupons = couponsSnap.docs.map((d) => d.data() as Coupon);

  // Build per-coupon stats in parallel
  const couponsWithStats: CouponWithStats[] = await Promise.all(
    coupons.map(async (coupon) => {
      // Count grants for this coupon (across all attendees via collectionGroup)
      const grantsSnap = await adminDb
        .collectionGroup("grants")
        .where("couponId", "==", coupon.id)
        .where("eventId", "==", eventId)
        .get();

      const grants = grantsSnap.docs.map((d) => d.data() as Grant);
      const granted = grants.length;
      const claimed = grants.filter((g) => g.status === "claimed").length;
      const claimRate = granted > 0 ? (claimed / granted) * 100 : 0;

      return {
        ...coupon,
        stats: {
          total: coupon.kind === "uniqueLink" ? (coupon.linkTotal ?? 0) : 1,
          available:
            coupon.kind === "uniqueLink" ? (coupon.linkAvailable ?? 0) : 0,
          granted,
          claimed,
          claimRate,
          disabled: coupon.isDisabled,
        },
      };
    })
  );

  return { coupons: couponsWithStats, eventId };
}

export async function getCouponLinks(
  eventId: string,
  couponId: string
): Promise<CouponLink[]> {
  await requireSession();

  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId)
    .collection("links")
    .orderBy("status")
    .get();

  return snap.docs.map((d) => d.data() as CouponLink);
}

export async function getCouponGrants(
  eventId: string,
  couponId: string
): Promise<Array<Grant & { attendeeName: string; attendeeEmail: string }>> {
  await requireSession();

  const grantsSnap = await adminDb
    .collectionGroup("grants")
    .where("couponId", "==", couponId)
    .where("eventId", "==", eventId)
    .get();

  const grants = grantsSnap.docs.map((d) => d.data() as Grant);

  // Batch-fetch attendee names / emails
  const attendeeIds = [...new Set(grants.map((g) => g.attendeeId))];
  const attendeeMap = new Map<string, { name: string; email: string }>();

  const CHUNK = 30;
  for (let i = 0; i < attendeeIds.length; i += CHUNK) {
    const chunk = attendeeIds.slice(i, i + CHUNK);
    const snap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .where("id", "in", chunk)
      .get();
    snap.docs.forEach((d) => {
      attendeeMap.set(d.id, {
        name: d.data().name,
        email: d.data().email,
      });
    });
  }

  return grants.map((g) => {
    const att = attendeeMap.get(g.attendeeId);
    return {
      ...g,
      attendeeName: att?.name ?? "—",
      attendeeEmail: att?.email ?? "—",
    };
  });
}
