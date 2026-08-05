import "server-only";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendees, couponLinks, emailLogs, grants } from "@/lib/db/schema";
import { Attendee, EmailStatus } from "@/lib/types";
import { nanoid } from "nanoid";

function toAttendee(row: typeof attendees.$inferSelect): Attendee {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    email: row.email,
    grantCount: row.grantCount,
    claimedCount: row.claimedCount,
    claimedAny: row.claimedAny,
    emailStatus: row.emailStatus as EmailStatus,
    emailSentAt: row.emailSentAt,
    claimToken: row.claimToken,
    createdAt: row.createdAt,
    registeredAt: row.registeredAt,
    checkedInAt: row.checkedInAt,
    isBlacklisted: row.isBlacklisted,
    isTest: row.isTest,
  };
}

export async function listAttendeesForEvent(eventId: string): Promise<Attendee[]> {
  const rows = await db
    .select()
    .from(attendees)
    .where(eq(attendees.eventId, eventId))
    .orderBy(desc(attendees.createdAt));
  return rows.map(toAttendee);
}

export async function getAttendeeById(
  eventId: string,
  attendeeId: string
): Promise<Attendee | null> {
  const rows = await db
    .select()
    .from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.id, attendeeId)))
    .limit(1);
  return rows[0] ? toAttendee(rows[0]) : null;
}

export async function listAttendeesByIds(ids: string[]): Promise<Attendee[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(attendees).where(inArray(attendees.id, ids));
  return rows.map(toAttendee);
}

export async function findAttendeeByEmailInEvent(
  eventId: string,
  email: string
): Promise<Attendee | null> {
  const rows = await db
    .select()
    .from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.email, email)))
    .limit(1);
  return rows[0] ? toAttendee(rows[0]) : null;
}

/**
 * Bulk-inserts attendee rows in one statement, skipping any that already
 * exist for (eventId, email). Replaces the get()-then-set()-per-row loop in
 * importAttendees / syncLumaGuests, which was the single biggest source of
 * Firestore read/write volume in the app.
 */
export async function bulkInsertAttendees(
  rows: Array<{
    id: string;
    eventId: string;
    name: string;
    email: string;
    createdAt: string;
    registeredAt?: string | null;
    checkedInAt?: string | null;
    isBlacklisted?: boolean;
    isTest?: boolean;
    claimToken?: string | null;
  }>
): Promise<{ inserted: Attendee[]; insertedCount: number; skippedCount: number }> {
  if (rows.length === 0) return { inserted: [], insertedCount: 0, skippedCount: 0 };

  const inserted = await db
    .insert(attendees)
    .values(
      rows.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        name: r.name,
        email: r.email,
        createdAt: r.createdAt,
        registeredAt: r.registeredAt ?? null,
        checkedInAt: r.checkedInAt ?? null,
        isBlacklisted: r.isBlacklisted ?? false,
        isTest: r.isTest ?? false,
        claimToken: r.claimToken ?? null,
      }))
    )
    .onConflictDoNothing({ target: [attendees.eventId, attendees.email] })
    .returning();

  return {
    inserted: inserted.map(toAttendee),
    insertedCount: inserted.length,
    skippedCount: rows.length - inserted.length,
  };
}

export async function countTestAttendees(eventId: string): Promise<number> {
  const rows = await db
    .select({ id: attendees.id })
    .from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.isTest, true)));
  return rows.length;
}

/** True if any draft test attendee exists across events (for onboarding progress). */
export async function hasAnyTestAttendees(): Promise<boolean> {
  const rows = await db
    .select({ id: attendees.id })
    .from(attendees)
    .where(eq(attendees.isTest, true))
    .limit(1);
  return rows.length > 0;
}

export async function listTestAttendees(eventId: string): Promise<Attendee[]> {
  const rows = await db
    .select()
    .from(attendees)
    .where(and(eq(attendees.eventId, eventId), eq(attendees.isTest, true)));
  return rows.map(toAttendee);
}

export async function setAttendeeBlacklisted(
  eventId: string,
  attendeeId: string,
  blacklisted: boolean
): Promise<void> {
  await db
    .update(attendees)
    .set({ isBlacklisted: blacklisted })
    .where(and(eq(attendees.eventId, eventId), eq(attendees.id, attendeeId)));
}

/** For an already-existing attendee re-seen during a Luma sync: blacklist
 * them if the event is over and they never checked in. */
export async function blacklistIfPastAndNotCheckedIn(
  eventId: string,
  attendeeId: string
): Promise<boolean> {
  const result = await db
    .update(attendees)
    .set({ isBlacklisted: true })
    .where(
      and(
        eq(attendees.eventId, eventId),
        eq(attendees.id, attendeeId),
        eq(attendees.isBlacklisted, false),
        sql`${attendees.checkedInAt} is null`
      )
    )
    .returning({ id: attendees.id });
  return result.length > 0;
}

export async function setEmailStatus(
  eventId: string,
  attendeeId: string,
  status: EmailStatus
): Promise<void> {
  await db
    .update(attendees)
    .set({ emailStatus: status })
    .where(and(eq(attendees.eventId, eventId), eq(attendees.id, attendeeId)));
}

export async function markEmailSent(
  eventId: string,
  attendeeId: string,
  sentAt: string
): Promise<void> {
  await db
    .update(attendees)
    .set({ emailStatus: "sent", emailSentAt: sentAt })
    .where(and(eq(attendees.eventId, eventId), eq(attendees.id, attendeeId)));
}

/** Ensures the attendee has a claim token, assigning one only if missing.
 * A single conditional UPDATE replaces the previous read-check-transaction
 * (Firestore had no server-side "assign only if null" primitive). */
export async function ensureClaimToken(
  eventId: string,
  attendeeId: string
): Promise<string> {
  const candidate = nanoid(32);
  const rows = await db
    .update(attendees)
    .set({ claimToken: sql`coalesce(${attendees.claimToken}, ${candidate})` })
    .where(and(eq(attendees.eventId, eventId), eq(attendees.id, attendeeId)))
    .returning({ claimToken: attendees.claimToken });

  if (!rows[0]) throw new Error("Attendee not found");
  if (!rows[0].claimToken) throw new Error("Failed to assign claim token");
  return rows[0].claimToken;
}

export async function getAttendeeByClaimToken(token: string): Promise<Attendee | null> {
  const rows = await db.select().from(attendees).where(eq(attendees.claimToken, token)).limit(1);
  return rows[0] ? toAttendee(rows[0]) : null;
}

/** Atomically claims an attendee for auto-send: flips pending/failed -> sending
 * only if grants exist and a claim token is present. Single UPDATE ... RETURNING
 * replaces the Firestore transaction. */
export async function claimAttendeeForAutoSend(
  eventId: string,
  attendeeId: string
): Promise<Attendee | null> {
  const rows = await db
    .update(attendees)
    .set({ emailStatus: "sending" })
    .where(
      and(
        eq(attendees.eventId, eventId),
        eq(attendees.id, attendeeId),
        eq(attendees.isBlacklisted, false),
        gt(attendees.grantCount, 0),
        sql`${attendees.claimToken} is not null`,
        sql`${attendees.emailStatus} in ('pending', 'failed')`
      )
    )
    .returning();

  return rows[0] ? toAttendee(rows[0]) : null;
}

/** Deletes an attendee, releasing any assigned pool links back to "available"
 * (the coupon_links_after_change trigger restores link_available), removing
 * their email logs, and clearing the claim token — all via cascades except
 * the link release, which is not a delete. */
export async function deleteAttendeeCascade(
  eventId: string,
  attendeeId: string
): Promise<{ deletedEmailLogs: number }> {
  return db.transaction(async (tx) => {
    // Release any uniqueLink pool links this attendee held back to available.
    const attendeeGrants = await tx
      .select({ linkId: grants.linkId })
      .from(grants)
      .where(and(eq(grants.attendeeId, attendeeId), eq(grants.eventId, eventId)));

    const linkIds = attendeeGrants.map((g) => g.linkId).filter((id): id is string => !!id);
    if (linkIds.length > 0) {
      await tx
        .update(couponLinks)
        .set({ status: "available", assignedTo: null, assignedAt: null })
        .where(inArray(couponLinks.id, linkIds));
    }

    const deletedLogs = await tx
      .delete(emailLogs)
      .where(eq(emailLogs.attendeeId, attendeeId))
      .returning({ id: emailLogs.id });

    // ON DELETE CASCADE on grants.attendee_id removes the grant rows, which
    // fires the counter-decrement trigger; deleting the attendee itself is
    // what we actually want to happen last.
    await tx.delete(attendees).where(and(eq(attendees.eventId, eventId), eq(attendees.id, attendeeId)));

    return { deletedEmailLogs: deletedLogs.length };
  });
}
