"use server";

import { writeAuditLog } from "@/lib/audit";
import { normalizeEmail } from "@/lib/utils";
import { listNonDraftEventsNewestFirst } from "@/lib/db/repos/events";
import { findAttendeeByEmailInEvent } from "@/lib/db/repos/attendees";

export async function checkAttendeeStatus(email: string): Promise<{
  found: boolean;
  eventName?: string;
  eventDate?: string;
  emailSent?: boolean;
  emailSentAt?: string | null;
  claimed?: boolean;
  grantCount?: number;
  isBlacklisted?: boolean;
}> {
  const normalizedEmail = normalizeEmail(email);

  const events = await listNonDraftEventsNewestFirst();

  for (const event of events) {
    const attendee = await findAttendeeByEmailInEvent(event.id, normalizedEmail);
    if (!attendee) continue;

    await writeAuditLog({
      eventId: event.id,
      action: "status_checked",
      metadata: { email: normalizedEmail },
    });

    return {
      found: true,
      eventName: event.name,
      eventDate: event.date,
      emailSent: attendee.emailStatus === "sent",
      emailSentAt: attendee.emailSentAt,
      claimed: attendee.claimedAny,
      grantCount: attendee.grantCount ?? 0,
      isBlacklisted: attendee.isBlacklisted ?? false,
    };
  }

  return { found: false };
}
