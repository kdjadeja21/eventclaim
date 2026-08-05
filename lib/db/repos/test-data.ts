import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { customAlphabet, nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { attendees, couponLinks, emailLogs, grants } from "@/lib/db/schema";
import { reserveSpecificLinkGrant } from "@/lib/db/repos/grants";
import { attendeeDocId } from "@/lib/import";
import type { Attendee } from "@/lib/types";

/** Matches real Cursor Credits links, e.g. https://cursor.com/referral?code=Y2YNAAENRTGDG */
const generateReferralCode = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  12
);

export function fakeCursorCreditsLinkUrl(code?: string): string {
  const referralCode = code ?? generateReferralCode();
  return `https://cursor.com/referral?code=${referralCode}`;
}

export async function createTempTestAttendeesWithLinks(params: {
  eventId: string;
  couponId: string;
  people: Array<{ name: string; email: string }>;
}): Promise<{ attendees: Attendee[]; linkIds: string[] }> {
  const { eventId, couponId, people } = params;
  const now = new Date().toISOString();

  const attendeeRows = people.map((p) => ({
    id: attendeeDocId(eventId, p.email),
    eventId,
    name: p.name,
    email: p.email,
    createdAt: now,
    registeredAt: now,
    checkedInAt: now,
    isTest: true as const,
    claimToken: nanoid(32),
  }));

  const linkRows = people.map(() => {
    const id = nanoid();
    return {
      id,
      couponId,
      eventId,
      url: fakeCursorCreditsLinkUrl(),
      isTest: true as const,
    };
  });

  await db.transaction(async (tx) => {
    await tx.insert(attendees).values(attendeeRows);
    await tx.insert(couponLinks).values(
      linkRows.map((l) => ({
        ...l,
        status: "available" as const,
      }))
    );
  });

  // Assign each fake link to its matching temp attendee (1:1).
  for (let i = 0; i < attendeeRows.length; i++) {
    const ok = await reserveSpecificLinkGrant({
      eventId,
      attendeeId: attendeeRows[i].id,
      couponId,
      linkId: linkRows[i].id,
    });
    if (!ok) {
      throw new Error("Failed to grant fake Cursor Credits link to temp attendee.");
    }
  }

  const inserted = await db
    .select()
    .from(attendees)
    .where(
      and(
        eq(attendees.eventId, eventId),
        inArray(
          attendees.id,
          attendeeRows.map((a) => a.id)
        )
      )
    );

  return {
    attendees: inserted.map((row) => ({
      id: row.id,
      eventId: row.eventId,
      name: row.name,
      email: row.email,
      grantCount: row.grantCount,
      claimedCount: row.claimedCount,
      claimedAny: row.claimedAny,
      emailStatus: row.emailStatus as Attendee["emailStatus"],
      emailSentAt: row.emailSentAt,
      claimToken: row.claimToken,
      createdAt: row.createdAt,
      registeredAt: row.registeredAt,
      checkedInAt: row.checkedInAt,
      isBlacklisted: row.isBlacklisted,
      isTest: row.isTest,
    })),
    linkIds: linkRows.map((l) => l.id),
  };
}

/**
 * Deletes all draft test attendees (and their grants/email logs) plus all
 * isTest coupon links for the event. Fake links are removed from the pool
 * rather than released as available.
 */
export async function deleteTempTestDataForEvent(
  eventId: string
): Promise<{ deletedAttendees: number; deletedLinks: number }> {
  return db.transaction(async (tx) => {
    const testAttendees = await tx
      .select({ id: attendees.id })
      .from(attendees)
      .where(and(eq(attendees.eventId, eventId), eq(attendees.isTest, true)));

    const attendeeIds = testAttendees.map((a) => a.id);

    if (attendeeIds.length > 0) {
      await tx.delete(emailLogs).where(inArray(emailLogs.attendeeId, attendeeIds));
      await tx
        .delete(grants)
        .where(and(eq(grants.eventId, eventId), inArray(grants.attendeeId, attendeeIds)));
      await tx
        .delete(attendees)
        .where(and(eq(attendees.eventId, eventId), inArray(attendees.id, attendeeIds)));
    }

    const deletedLinks = await tx
      .delete(couponLinks)
      .where(and(eq(couponLinks.eventId, eventId), eq(couponLinks.isTest, true)))
      .returning({ id: couponLinks.id });

    return {
      deletedAttendees: attendeeIds.length,
      deletedLinks: deletedLinks.length,
    };
  });
}
