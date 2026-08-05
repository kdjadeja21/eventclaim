import "server-only";
import { and, asc, eq, notExists } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendees, couponLinks, grants } from "@/lib/db/schema";
import { CouponLink, CouponLinkStatus } from "@/lib/types";

function toCouponLink(row: typeof couponLinks.$inferSelect): CouponLink {
  return {
    id: row.id,
    couponId: row.couponId,
    eventId: row.eventId,
    url: row.url,
    status: row.status as CouponLinkStatus,
    assignedTo: row.assignedTo,
    assignedAt: row.assignedAt,
    claimedAt: row.claimedAt,
    isDisabled: row.isDisabled,
    isTest: row.isTest,
  };
}

export async function listLinksForCouponOrdered(
  eventId: string,
  couponId: string
): Promise<CouponLink[]> {
  const rows = await db
    .select()
    .from(couponLinks)
    .where(and(eq(couponLinks.eventId, eventId), eq(couponLinks.couponId, couponId)))
    .orderBy(asc(couponLinks.status));
  return rows.map(toCouponLink);
}

export async function listAvailableLinks(eventId: string, couponId: string) {
  const rows = await db
    .select({ id: couponLinks.id, url: couponLinks.url })
    .from(couponLinks)
    .where(
      and(
        eq(couponLinks.eventId, eventId),
        eq(couponLinks.couponId, couponId),
        eq(couponLinks.status, "available"),
        eq(couponLinks.isDisabled, false)
      )
    );
  return rows;
}

/** Attendees not blacklisted who have no grant for this coupon yet, replacing
 * the previous "fetch all attendees + fetch all grants, diff in memory"
 * pattern with a single anti-join. */
export async function listUnassignedAttendees(eventId: string, couponId: string) {
  const rows = await db
    .select({ id: attendees.id, name: attendees.name, email: attendees.email })
    .from(attendees)
    .where(
      and(
        eq(attendees.eventId, eventId),
        eq(attendees.isBlacklisted, false),
        notExists(
          db
            .select()
            .from(grants)
            .where(and(eq(grants.attendeeId, attendees.id), eq(grants.couponId, couponId)))
        )
      )
    )
    .orderBy(asc(attendees.name));
  return rows;
}

/** Bulk-inserts pool links for a uniqueLink coupon. Every uploaded link is
 * treated as unique (matches the existing no-dedup behavior). */
export async function bulkInsertCouponLinks(
  links: Array<{
    id: string;
    couponId: string;
    eventId: string;
    url: string;
    isTest?: boolean;
  }>
): Promise<number> {
  if (links.length === 0) return 0;
  const inserted = await db
    .insert(couponLinks)
    .values(
      links.map((l) => ({
        id: l.id,
        couponId: l.couponId,
        eventId: l.eventId,
        url: l.url,
        status: "available" as const,
        isTest: l.isTest ?? false,
      }))
    )
    .returning({ id: couponLinks.id });
  return inserted.length;
}

export async function setLinkDisabled(
  eventId: string,
  couponId: string,
  linkId: string,
  disabled: boolean
): Promise<boolean> {
  const rows = await db
    .update(couponLinks)
    .set({ isDisabled: disabled })
    .where(
      and(
        eq(couponLinks.eventId, eventId),
        eq(couponLinks.couponId, couponId),
        eq(couponLinks.id, linkId)
      )
    )
    .returning({ id: couponLinks.id });
  return rows.length > 0;
}

export async function getLink(eventId: string, couponId: string, linkId: string) {
  const rows = await db
    .select()
    .from(couponLinks)
    .where(
      and(
        eq(couponLinks.eventId, eventId),
        eq(couponLinks.couponId, couponId),
        eq(couponLinks.id, linkId)
      )
    )
    .limit(1);
  return rows[0] ? toCouponLink(rows[0]) : null;
}

/** Deletes an available (unassigned) pool link. Fails silently (returns
 * false) if the link is not in the available state — mirrors the previous
 * guard in the server action. */
export async function deleteAvailableLink(
  eventId: string,
  couponId: string,
  linkId: string
): Promise<boolean> {
  const rows = await db
    .delete(couponLinks)
    .where(
      and(
        eq(couponLinks.eventId, eventId),
        eq(couponLinks.couponId, couponId),
        eq(couponLinks.id, linkId),
        eq(couponLinks.status, "available")
      )
    )
    .returning({ id: couponLinks.id });
  return rows.length > 0;
}
