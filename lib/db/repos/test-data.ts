import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { attendees, couponLinks, emailLogs, grants } from "@/lib/db/schema";
import { grantOneCoupon } from "@/lib/db/repos/grants";
import { attendeeDocId } from "@/lib/import";
import type { Attendee, Coupon } from "@/lib/types";

export async function createTempTestAttendees(params: {
  eventId: string;
  coupon: Coupon;
  people: Array<{ name: string; email: string }>;
}): Promise<{ attendees: Attendee[] }> {
  const { eventId, coupon, people } = params;
  const now = new Date().toISOString();

  if (coupon.kind !== "uniqueLink" && !coupon.sharedValue?.trim()) {
    throw new Error("Cursor Credits needs a shared link before temp attendees can be created.");
  }

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

  await db.insert(attendees).values(attendeeRows);

  for (const attendee of attendeeRows) {
    const ok = await grantOneCoupon(eventId, attendee.id, coupon);
    if (!ok) {
      throw new Error(
        coupon.kind === "uniqueLink"
          ? "Add unique Cursor Credits links to the pool before creating temp attendees."
          : "Failed to grant the shared Cursor Credits link to a temp attendee."
      );
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
  };
}

/**
 * Deletes all draft test attendees (and their grants/email logs) plus any
 * leftover isTest coupon links from older unique-link test data.
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
