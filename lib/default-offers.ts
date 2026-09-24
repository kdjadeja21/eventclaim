import "server-only";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { couponLinks, coupons, grants } from "@/lib/db/schema";
import { insertCoupon, getMaxSortOrder } from "@/lib/db/repos/coupons";
import { assignPendingForEvent as assignPendingGrants } from "@/lib/db/repos/grants";
import type { Coupon } from "@/lib/types";

export const CURSOR_CREDITS_OFFER_NAME = "Cursor Credits";

const LEGACY_UNIQUE_LINK_DESCRIPTION =
  "Open your personal claim link and redeem your Cursor credits.";

export const CURSOR_CREDITS_DESCRIPTION =
  "Open the shared claim link and redeem your Cursor credits.";

/**
 * One URL granted to every attendee. Unique per-person referral links are no
 * longer required for Cursor Credits. Set CURSOR_CREDITS_SHARED_URL to bake
 * the ambassador link into new events; otherwise paste it on the offer.
 */
export function cursorCreditsSharedUrl(): string {
  return process.env.CURSOR_CREDITS_SHARED_URL?.trim() ?? "";
}

/** Default Cursor Credits shared-link partner offer created with every event. */
export function buildDefaultCursorCreditsCoupon(eventId: string, sortOrder: number): Coupon {
  const sharedUrl = cursorCreditsSharedUrl();
  return {
    id: nanoid(),
    eventId,
    name: CURSOR_CREDITS_OFFER_NAME,
    kind: "sharedLink",
    category: "AI EDITOR",
    logoUrl: "/partner-logos/cursor_logo.svg",
    highlight: "Cursor credits for attendees",
    description: CURSOR_CREDITS_DESCRIPTION,
    ...(sharedUrl ? { sharedValue: sharedUrl } : {}),
    sortOrder,
    isDisabled: false,
    createdAt: new Date().toISOString(),
  };
}

function toCoupon(row: typeof coupons.$inferSelect): Coupon {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    kind: row.kind as Coupon["kind"],
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

/**
 * Points every grant for this coupon at the shared URL and drops the unique
 * link pool. Existing claim status is kept.
 */
export async function retargetCursorCreditsToSharedLink(
  eventId: string,
  couponId: string,
  sharedUrl: string
): Promise<void> {
  const url = sharedUrl.trim();
  if (!url) return;

  await db.transaction(async (tx) => {
    await tx
      .update(grants)
      .set({ value: url, linkId: null })
      .where(and(eq(grants.eventId, eventId), eq(grants.couponId, couponId)));

    await tx
      .delete(couponLinks)
      .where(and(eq(couponLinks.eventId, eventId), eq(couponLinks.couponId, couponId)));
  });
}

/**
 * Returns the event's Cursor Credits coupon, creating it if missing.
 * Older unique-link Cursor Credits offers are converted to a shared link.
 * Safe to call for older events that predate auto-create.
 */
export async function ensureDefaultCursorCreditsCoupon(eventId: string): Promise<Coupon> {
  const existing = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.eventId, eventId), eq(coupons.name, CURSOR_CREDITS_OFFER_NAME)))
    .limit(1);

  if (!existing[0]) {
    const sortOrder = (await getMaxSortOrder(eventId)) + 1;
    const coupon = buildDefaultCursorCreditsCoupon(eventId, sortOrder);
    await insertCoupon(coupon);
    if (coupon.sharedValue) {
      await assignPendingGrants(eventId);
    }
    return coupon;
  }

  const row = existing[0];
  const envUrl = cursorCreditsSharedUrl();
  const sharedValue = row.sharedValue?.trim() || envUrl || "";
  const needsKind = row.kind !== "sharedLink";
  const needsValue = !row.sharedValue?.trim() && Boolean(envUrl);
  const needsDescription = row.description === LEGACY_UNIQUE_LINK_DESCRIPTION;

  if (!needsKind && !needsValue && !needsDescription) {
    return toCoupon(row);
  }

  const description = needsDescription ? CURSOR_CREDITS_DESCRIPTION : row.description;

  await db
    .update(coupons)
    .set({
      kind: "sharedLink",
      description,
      ...(sharedValue ? { sharedValue } : {}),
    })
    .where(and(eq(coupons.eventId, eventId), eq(coupons.id, row.id)));

  if (sharedValue) {
    await retargetCursorCreditsToSharedLink(eventId, row.id, sharedValue);
    await assignPendingGrants(eventId);
  }

  const updated = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.eventId, eventId), eq(coupons.id, row.id)))
    .limit(1);

  return toCoupon(updated[0] ?? { ...row, kind: "sharedLink", description, sharedValue: sharedValue || null });
}
