import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendees, emailLogs } from "@/lib/db/schema";
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
  };
}

export async function insertEmailLog(log: {
  attendeeId: string;
  eventId: string;
  emailType: "initial" | "resend";
  sentAt: string;
  status: "sent" | "failed";
  error?: string;
}): Promise<void> {
  await db.insert(emailLogs).values({
    id: nanoid(),
    attendeeId: log.attendeeId,
    eventId: log.eventId,
    emailType: log.emailType,
    sentAt: log.sentAt,
    status: log.status,
    error: log.error,
  });
}

export async function listEmailLogsForAttendee(attendeeId: string, limit: number) {
  const rows = await db
    .select()
    .from(emailLogs)
    .where(eq(emailLogs.attendeeId, attendeeId))
    .orderBy(desc(emailLogs.sentAt))
    .limit(limit);
  return rows;
}

export async function listAttendeesByEmailStatusWithGrants(
  eventId: string,
  status: EmailStatus
): Promise<Attendee[]> {
  const rows = await db
    .select()
    .from(attendees)
    .where(
      and(eq(attendees.eventId, eventId), eq(attendees.emailStatus, status), gt(attendees.grantCount, 0))
    );
  return rows.map(toAttendee);
}
