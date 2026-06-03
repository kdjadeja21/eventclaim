"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { Coupon, CouponWithAttendee, CouponStats, Attendee } from "@/lib/types";

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
  coupons: CouponWithAttendee[];
  eventId: string;
  stats: CouponStats;
}> {
  await requireSession();
  const eventId = await resolveEventId(slug);

  const couponsSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .orderBy("status")
    .get();

  const rawCoupons = couponsSnap.docs.map((d) => d.data() as Coupon);

  // Collect unique attendee IDs to batch-fetch
  const attendeeIds = [
    ...new Set(rawCoupons.map((c) => c.assignedTo).filter(Boolean) as string[]),
  ];

  const attendeeMap = new Map<string, { name: string; email: string }>();
  if (attendeeIds.length > 0) {
    // Firestore 'in' query max 30 items; chunk if needed
    const chunks: string[][] = [];
    for (let i = 0; i < attendeeIds.length; i += 30) {
      chunks.push(attendeeIds.slice(i, i + 30));
    }
    await Promise.all(
      chunks.map(async (chunk) => {
        const snap = await adminDb
          .collection("events")
          .doc(eventId)
          .collection("attendees")
          .where("id", "in", chunk)
          .get();
        snap.docs.forEach((d) => {
          const a = d.data() as Attendee;
          attendeeMap.set(a.id, { name: a.name, email: a.email });
        });
      })
    );
  }

  const coupons: CouponWithAttendee[] = rawCoupons.map((c) => {
    const att = c.assignedTo ? attendeeMap.get(c.assignedTo) : null;
    return {
      ...c,
      attendeeName: att?.name ?? null,
      attendeeEmail: att?.email ?? null,
    };
  });

  // Compute stats
  const total = coupons.length;
  const available = coupons.filter((c) => c.status === "available").length;
  const assigned = coupons.filter((c) => c.status === "assigned").length;
  const emailSent = coupons.filter((c) => c.status === "emailSent").length;
  const claimed = coupons.filter((c) => c.status === "claimed").length;
  const unclaimed = assigned + emailSent;
  const assignedTotal = total - available;
  const assignRate = total > 0 ? (assignedTotal / total) * 100 : 0;
  const claimRate = assignedTotal > 0 ? (claimed / assignedTotal) * 100 : 0;

  const stats: CouponStats = {
    total,
    available,
    assigned,
    emailSent,
    claimed,
    unclaimed,
    assignRate,
    claimRate,
  };

  return { coupons, eventId, stats };
}

export async function getAssignableAttendees(
  eventId: string
): Promise<Array<{ id: string; name: string; email: string }>> {
  await requireSession();

  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .where("couponId", "==", null)
    .orderBy("name")
    .get();

  return snap.docs.map((d) => {
    const a = d.data() as Attendee;
    return { id: a.id, name: a.name, email: a.email };
  });
}

export async function getAvailableCoupons(
  eventId: string
): Promise<Array<{ id: string; couponLink: string }>> {
  await requireSession();

  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .where("status", "==", "available")
    .get();

  return snap.docs.map((d) => {
    const c = d.data() as Coupon;
    return { id: c.id, couponLink: c.couponLink };
  });
}
