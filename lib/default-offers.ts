import "server-only";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { coupons } from "@/lib/db/schema";
import { insertCoupon, getMaxSortOrder } from "@/lib/db/repos/coupons";
import type { Coupon } from "@/lib/types";

export const CURSOR_CREDITS_OFFER_NAME = "Cursor Credits";

/** Default Cursor Credits uniqueLink partner offer created with every event. */
export function buildDefaultCursorCreditsCoupon(eventId: string, sortOrder: number): Coupon {
  return {
    id: nanoid(),
    eventId,
    name: CURSOR_CREDITS_OFFER_NAME,
    kind: "uniqueLink",
    category: "AI EDITOR",
    logoUrl: "/partner-logos/cursor_logo.svg",
    highlight: "Cursor credits for attendees",
    description: "Open your personal claim link and redeem your Cursor credits.",
    sortOrder,
    isDisabled: false,
    createdAt: new Date().toISOString(),
    linkTotal: 0,
    linkAvailable: 0,
  };
}

/**
 * Returns the event's Cursor Credits coupon, creating it if missing.
 * Safe to call for older events that predate auto-create.
 */
export async function ensureDefaultCursorCreditsCoupon(eventId: string): Promise<Coupon> {
  const existing = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.eventId, eventId), eq(coupons.name, CURSOR_CREDITS_OFFER_NAME)))
    .limit(1);

  if (existing[0]) {
    return {
      id: existing[0].id,
      eventId: existing[0].eventId,
      name: existing[0].name,
      kind: existing[0].kind as Coupon["kind"],
      category: existing[0].category,
      logoUrl: existing[0].logoUrl,
      highlight: existing[0].highlight,
      description: existing[0].description,
      note: existing[0].note ?? undefined,
      sharedValue: existing[0].sharedValue ?? undefined,
      redeemUrl: existing[0].redeemUrl ?? undefined,
      linkTotal: existing[0].linkTotal,
      linkAvailable: existing[0].linkAvailable,
      sortOrder: existing[0].sortOrder,
      isDisabled: existing[0].isDisabled,
      createdAt: existing[0].createdAt,
    };
  }

  const sortOrder = (await getMaxSortOrder(eventId)) + 1;
  const coupon = buildDefaultCursorCreditsCoupon(eventId, sortOrder);
  await insertCoupon(coupon);
  return coupon;
}
