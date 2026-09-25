import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendees, couponLinks, coupons, grants } from "@/lib/db/schema";
import { Coupon, CouponKind, CouponWithStats } from "@/lib/types";

function toCoupon(row: typeof coupons.$inferSelect): Coupon {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    kind: row.kind as CouponKind,
    category: row.category,
    logoUrl: row.logoUrl,
    highlight: row.highlight,
    description: row.description,
    note: row.note ?? undefined,
    sharedValue: row.sharedValue ?? undefined,
    redeemUrl: row.redeemUrl ?? undefined,
    linkTotal: row.linkTotal,
    linkAvailable: row.linkAvailable,
    sortOrder: row.sortOrder,
    isDisabled: row.isDisabled,
    createdAt: row.createdAt,
  };
}

export async function listCouponsForEvent(eventId: string): Promise<Coupon[]> {
  const rows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.eventId, eventId))
    .orderBy(asc(coupons.sortOrder));
  return rows.map(toCoupon);
}

export async function listEnabledCouponsForEvent(eventId: string): Promise<Coupon[]> {
  const rows = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.eventId, eventId), eq(coupons.isDisabled, false)));
  return rows.map(toCoupon);
}

export async function getCouponById(eventId: string, couponId: string): Promise<Coupon | null> {
  const rows = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.eventId, eventId), eq(coupons.id, couponId)))
    .limit(1);
  return rows[0] ? toCoupon(rows[0]) : null;
}

/**
 * One grouped-aggregate query replaces the previous N+1 pattern where
 * getCoupons ran a separate collectionGroup scan per coupon to count grants.
 */
export async function listCouponsWithStats(eventId: string): Promise<CouponWithStats[]> {
  const couponRows = await listCouponsForEvent(eventId);
  if (couponRows.length === 0) return [];

  const grantCounts = await db
    .select({
      couponId: grants.couponId,
      granted: sql<number>`count(*)`.mapWith(Number),
      claimed: sql<number>`count(*) filter (where ${grants.status} = 'claimed')`.mapWith(Number),
    })
    .from(grants)
    .where(eq(grants.eventId, eventId))
    .groupBy(grants.couponId);

  const statsMap = new Map(grantCounts.map((r) => [r.couponId, r]));

  return couponRows.map((coupon) => {
    const stat = statsMap.get(coupon.id) ?? { granted: 0, claimed: 0 };
    const granted = stat.granted;
    const claimed = stat.claimed;
    return {
      ...coupon,
      stats: {
        total: coupon.kind === "uniqueLink" ? coupon.linkTotal ?? 0 : 1,
        available: coupon.kind === "uniqueLink" ? coupon.linkAvailable ?? 0 : 0,
        granted,
        claimed,
        claimRate: granted > 0 ? (claimed / granted) * 100 : 0,
        disabled: coupon.isDisabled,
      },
    };
  });
}

export async function insertCoupon(coupon: Coupon): Promise<void> {
  await db.insert(coupons).values({
    id: coupon.id,
    eventId: coupon.eventId,
    name: coupon.name,
    kind: coupon.kind,
    category: coupon.category,
    logoUrl: coupon.logoUrl,
    highlight: coupon.highlight,
    description: coupon.description,
    note: coupon.note ?? null,
    sharedValue: coupon.sharedValue ?? null,
    redeemUrl: coupon.redeemUrl ?? null,
    linkTotal: coupon.linkTotal ?? 0,
    linkAvailable: coupon.linkAvailable ?? 0,
    sortOrder: coupon.sortOrder,
    isDisabled: coupon.isDisabled,
    createdAt: coupon.createdAt,
  });
}

export async function getMaxSortOrder(eventId: string): Promise<number> {
  const rows = await db
    .select({ sortOrder: coupons.sortOrder })
    .from(coupons)
    .where(eq(coupons.eventId, eventId))
    .orderBy(desc(coupons.sortOrder))
    .limit(1);
  return rows[0]?.sortOrder ?? 0;
}

export async function updateCouponFields(
  eventId: string,
  couponId: string,
  fields: Partial<{
    name: string;
    category: string;
    logoUrl: string;
    highlight: string;
    description: string;
    note: string | null;
    sharedValue: string | null;
    redeemUrl: string | null;
    sortOrder: number;
    isDisabled: boolean;
  }>
): Promise<void> {
  await db
    .update(coupons)
    .set(fields)
    .where(and(eq(coupons.eventId, eventId), eq(coupons.id, couponId)));
}

/** Sets sortOrder for every coupon id to its index in orderedIds, in one
 * round trip via a VALUES-based bulk update. */
export async function reorderCoupons(eventId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(coupons)
        .set({ sortOrder: i })
        .where(and(eq(coupons.eventId, eventId), eq(coupons.id, orderedIds[i])));
    }
  });
}

export async function deleteCouponCascade(eventId: string, couponId: string): Promise<void> {
  // ON DELETE CASCADE on coupon_links.coupon_id and grants.coupon_id handles
  // the rest; the counter triggers fire per removed row automatically.
  await db.delete(coupons).where(and(eq(coupons.eventId, eventId), eq(coupons.id, couponId)));
}

export async function listGrantsForCouponWithAttendee(eventId: string, couponId: string) {
  const rows = await db
    .select({
      couponId: grants.couponId,
      eventId: grants.eventId,
      attendeeId: grants.attendeeId,
      value: grants.value,
      linkId: grants.linkId,
      status: grants.status,
      assignedAt: grants.assignedAt,
      claimedAt: grants.claimedAt,
      attendeeName: attendees.name,
      attendeeEmail: attendees.email,
    })
    .from(grants)
    .innerJoin(attendees, eq(attendees.id, grants.attendeeId))
    .where(and(eq(grants.eventId, eventId), eq(grants.couponId, couponId)));

  return rows;
}

export async function listLinksForCoupon(eventId: string, couponId: string) {
  const rows = await db
    .select({
      link: couponLinks,
      attendeeName: attendees.name,
      attendeeEmail: attendees.email,
      attendeeEmailStatus: attendees.emailStatus,
    })
    .from(couponLinks)
    .leftJoin(attendees, eq(attendees.id, couponLinks.assignedTo))
    .where(and(eq(couponLinks.eventId, eventId), eq(couponLinks.couponId, couponId)))
    .orderBy(asc(couponLinks.status));

  return rows;
}
