"use server";

import { requireSession } from "@/lib/session";
import { CouponLink, CouponWithStats, Grant } from "@/lib/types";
import { resolveEventId } from "@/lib/db/repos/events";
import { listCouponsWithStats, listGrantsForCouponWithAttendee } from "@/lib/db/repos/coupons";
import { listLinksForCouponOrdered } from "@/lib/db/repos/links";

export async function getCoupons(slug: string): Promise<{
  coupons: CouponWithStats[];
  eventId: string;
}> {
  await requireSession();
  const eventId = await resolveEventId(slug);
  const coupons = await listCouponsWithStats(eventId);
  return { coupons, eventId };
}

export async function getCouponLinks(
  eventId: string,
  couponId: string
): Promise<CouponLink[]> {
  await requireSession();
  return listLinksForCouponOrdered(eventId, couponId);
}

export async function getCouponGrants(
  eventId: string,
  couponId: string
): Promise<Array<Grant & { attendeeName: string; attendeeEmail: string }>> {
  await requireSession();
  const rows = await listGrantsForCouponWithAttendee(eventId, couponId);
  return rows.map((r) => ({
    couponId: r.couponId,
    eventId: r.eventId,
    attendeeId: r.attendeeId,
    value: r.value,
    linkId: r.linkId ?? undefined,
    status: r.status as Grant["status"],
    assignedAt: r.assignedAt,
    claimedAt: r.claimedAt,
    attendeeName: r.attendeeName,
    attendeeEmail: r.attendeeEmail,
  }));
}
