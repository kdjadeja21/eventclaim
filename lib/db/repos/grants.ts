import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendees, couponLinks, coupons, grants } from "@/lib/db/schema";
import { Coupon, CouponKind } from "@/lib/types";

/**
 * Reserves one available, non-disabled link from the pool for a uniqueLink
 * coupon and grants it to the attendee, in a single round trip:
 * `FOR UPDATE SKIP LOCKED` picks a row no other concurrent reservation is
 * touching, and `ON CONFLICT DO NOTHING` on the grants PK makes the whole
 * operation idempotent if the attendee already has this grant. This replaces
 * the previous "read up to 10 candidates, then retry inside a Firestore
 * transaction" dance with zero read-then-write race window.
 */
export async function reserveUniqueLinkGrant(
  params: { eventId: string; attendeeId: string; couponId: string }
): Promise<boolean> {
  const { eventId, attendeeId, couponId } = params;
  const now = new Date().toISOString();

  const rows = await db.execute<{ link_id: string }>(sql`
    with picked as (
      select id, url from coupon_links
      where coupon_id = ${couponId} and status = 'available' and not is_disabled
      order by id
      for update skip locked
      limit 1
    ), inserted as (
      insert into grants (attendee_id, coupon_id, event_id, value, link_id, status, assigned_at)
      select ${attendeeId}, ${couponId}, ${eventId}, picked.url, picked.id, 'assigned', ${now}
      from picked
      on conflict (attendee_id, coupon_id) do nothing
      returning link_id
    )
    update coupon_links
    set status = 'assigned', assigned_to = ${attendeeId}, assigned_at = ${now}
    where id = (select link_id from inserted)
    returning coupon_links.id as link_id
  `);

  return rows.length > 0;
}

/** Reserves a *specific* pool link (manual assignment from the admin UI). */
export async function reserveSpecificLinkGrant(
  params: { eventId: string; attendeeId: string; couponId: string; linkId: string }
): Promise<boolean> {
  const { eventId, attendeeId, couponId, linkId } = params;
  const now = new Date().toISOString();

  const rows = await db.execute<{ link_id: string }>(sql`
    with picked as (
      select id, url from coupon_links
      where id = ${linkId} and coupon_id = ${couponId} and status = 'available' and not is_disabled
      for update skip locked
    ), inserted as (
      insert into grants (attendee_id, coupon_id, event_id, value, link_id, status, assigned_at)
      select ${attendeeId}, ${couponId}, ${eventId}, picked.url, picked.id, 'assigned', ${now}
      from picked
      on conflict (attendee_id, coupon_id) do nothing
      returning link_id
    )
    update coupon_links
    set status = 'assigned', assigned_to = ${attendeeId}, assigned_at = ${now}
    where id = (select link_id from inserted)
    returning coupon_links.id as link_id
  `);

  return rows.length > 0;
}

export async function grantSharedCoupon(
  params: { eventId: string; attendeeId: string; couponId: string; sharedValue: string }
): Promise<boolean> {
  const { eventId, attendeeId, couponId, sharedValue } = params;
  const rows = await db
    .insert(grants)
    .values({
      attendeeId,
      couponId,
      eventId,
      value: sharedValue,
      status: "assigned",
      assignedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ attendeeId: grants.attendeeId });

  return rows.length > 0;
}

/** Grants a single coupon definition to one attendee. Idempotent. */
export async function grantOneCoupon(
  eventId: string,
  attendeeId: string,
  coupon: Coupon
): Promise<boolean> {
  if (coupon.kind === "uniqueLink") {
    return reserveUniqueLinkGrant({ eventId, attendeeId, couponId: coupon.id });
  }
  if (!coupon.sharedValue) return false;
  return grantSharedCoupon({
    eventId,
    attendeeId,
    couponId: coupon.id,
    sharedValue: coupon.sharedValue,
  });
}

/**
 * Grants every enabled coupon in the event to every eligible attendee that
 * doesn't already have it, all in one statement per coupon rather than one
 * transaction per (attendee, coupon) pair. This is the fix for the biggest
 * source of Firestore quota burn: a 500-attendee x 4-coupon import used to
 * cost ~4,000 Firestore ops; here it costs a handful of SQL statements.
 * Returns the ids of attendees who received at least one new grant, so
 * callers can trigger per-attendee side effects (claim token, auto-send).
 */
export async function assignPendingForEvent(eventId: string): Promise<string[]> {
  const enabledCoupons = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.eventId, eventId), eq(coupons.isDisabled, false)));

  if (enabledCoupons.length === 0) return [];

  const touchedAttendees = new Set<string>();

  await db.transaction(async (tx) => {
    for (const coupon of enabledCoupons) {
      if (coupon.kind === "uniqueLink") {
        // Pair every ungranted, non-blacklisted attendee (checked-in first,
        // then by registration/creation order — same priority as before)
        // against the available pool, one link each, set-based.
        const rows = await tx.execute<{ attendee_id: string }>(sql`
          with ordered_attendees as (
            select a.id,
                   row_number() over (
                     order by
                       (a.checked_in_at is null) asc,
                       coalesce(a.checked_in_at, a.registered_at, a.created_at) asc
                   ) as rn
            from attendees a
            where a.event_id = ${eventId}
              and not a.is_blacklisted
              and not exists (
                select 1 from grants g
                where g.attendee_id = a.id and g.coupon_id = ${coupon.id}
              )
          ),
          -- FOR UPDATE cannot be combined with a window function in the same
          -- select, so lock the candidate rows first, then number them.
          available_links_locked as (
            select id, url from coupon_links
            where coupon_id = ${coupon.id} and status = 'available' and not is_disabled
            order by id
            for update skip locked
          ),
          available_links as (
            select id, url, row_number() over (order by id) as rn
            from available_links_locked
          ),
          paired as (
            select oa.id as attendee_id, al.id as link_id, al.url
            from ordered_attendees oa
            join available_links al on al.rn = oa.rn
          ),
          inserted as (
            insert into grants (attendee_id, coupon_id, event_id, value, link_id, status, assigned_at)
            select attendee_id, ${coupon.id}, ${eventId}, url, link_id, 'assigned', now()::text
            from paired
            on conflict (attendee_id, coupon_id) do nothing
            returning attendee_id, link_id
          )
          update coupon_links
          set status = 'assigned', assigned_to = inserted.attendee_id, assigned_at = now()::text
          from inserted
          where coupon_links.id = inserted.link_id
          returning inserted.attendee_id
        `);
        rows.forEach((r) => touchedAttendees.add(r.attendee_id));
      } else if (coupon.sharedValue) {
        const rows = await tx.execute<{ attendee_id: string }>(sql`
          insert into grants (attendee_id, coupon_id, event_id, value, status, assigned_at)
          select a.id, ${coupon.id}, ${eventId}, ${coupon.sharedValue}, 'assigned', now()::text
          from attendees a
          where a.event_id = ${eventId}
            and not a.is_blacklisted
            and not exists (
              select 1 from grants g
              where g.attendee_id = a.id and g.coupon_id = ${coupon.id}
            )
          on conflict (attendee_id, coupon_id) do nothing
          returning attendee_id
        `);
        rows.forEach((r) => touchedAttendees.add(r.attendee_id));
      }
    }

    // Attendees that received a new grant transition to emailStatus=pending
    // (mirrors the old per-attendee update after each grant batch) and get a
    // claim token if they don't have one yet.
    if (touchedAttendees.size > 0) {
      const ids = [...touchedAttendees];
      await tx
        .update(attendees)
        .set({
          emailStatus: "pending",
          // gen_random_uuid() is built into Postgres core (13+), unlike
          // gen_random_bytes() which needs the pgcrypto extension enabled.
          claimToken: sql`coalesce(${attendees.claimToken}, replace(gen_random_uuid()::text, '-', ''))`,
        })
        .where(inArray(attendees.id, ids));
    }
  });

  return [...touchedAttendees];
}

export async function getGrant(eventId: string, attendeeId: string, couponId: string) {
  const rows = await db
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.eventId, eventId),
        eq(grants.attendeeId, attendeeId),
        eq(grants.couponId, couponId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listGrantsForAttendee(eventId: string, attendeeId: string) {
  return db
    .select()
    .from(grants)
    .where(and(eq(grants.eventId, eventId), eq(grants.attendeeId, attendeeId)));
}

/** Unassigns a grant: deletes the grant row and releases its pool link. One
 * transaction, both counter triggers fire automatically. */
export async function unassignGrant(
  eventId: string,
  attendeeId: string,
  couponId: string,
  linkId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(grants)
      .where(
        and(
          eq(grants.eventId, eventId),
          eq(grants.attendeeId, attendeeId),
          eq(grants.couponId, couponId)
        )
      );
    await tx
      .update(couponLinks)
      .set({ status: "available", assignedTo: null, assignedAt: null })
      .where(eq(couponLinks.id, linkId));
  });
}

/**
 * Marks a grant claimed exactly once — the `status = 'assigned'` guard makes
 * repeat calls (e.g. a re-clicked claim link) no-ops, replacing the Firestore
 * transaction that read-checked-then-wrote the same invariant.
 */
export async function claimGrant(params: {
  eventId: string;
  attendeeId: string;
  couponId: string;
}): Promise<{
  found: boolean;
  newlyClaimed: boolean;
  linkId: string | null;
  value: string | null;
}> {
  const { eventId, attendeeId, couponId } = params;
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const claimed = await tx
      .update(grants)
      .set({ status: "claimed", claimedAt: now })
      .where(
        and(
          eq(grants.eventId, eventId),
          eq(grants.attendeeId, attendeeId),
          eq(grants.couponId, couponId),
          eq(grants.status, "assigned")
        )
      )
      .returning({ linkId: grants.linkId, value: grants.value });

    if (claimed.length === 0) {
      // Either already claimed or doesn't exist — fetch so redeem redirects
      // still work idempotently on a repeat click.
      const existing = await tx
        .select({ linkId: grants.linkId, value: grants.value })
        .from(grants)
        .where(
          and(
            eq(grants.eventId, eventId),
            eq(grants.attendeeId, attendeeId),
            eq(grants.couponId, couponId)
          )
        )
        .limit(1);
      if (!existing[0]) return { found: false, newlyClaimed: false, linkId: null, value: null };
      return {
        found: true,
        newlyClaimed: false,
        linkId: existing[0].linkId,
        value: existing[0].value,
      };
    }

    const { linkId, value } = claimed[0];
    if (linkId) {
      await tx
        .update(couponLinks)
        .set({ status: "claimed", claimedAt: now })
        .where(eq(couponLinks.id, linkId));
    }

    await tx.update(attendees).set({ claimedAny: true }).where(eq(attendees.id, attendeeId));

    return { found: true, newlyClaimed: true, linkId, value };
  });
}

export async function getCouponNameAndKind(
  eventId: string,
  couponId: string
): Promise<{ couponName: string; kind: CouponKind }> {
  const rows = await db
    .select({ name: coupons.name, kind: coupons.kind })
    .from(coupons)
    .where(and(eq(coupons.eventId, eventId), eq(coupons.id, couponId)))
    .limit(1);

  if (!rows[0]) return { couponName: couponId, kind: "sharedCode" };
  return { couponName: rows[0].name, kind: rows[0].kind as CouponKind };
}
