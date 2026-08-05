import { writeAuditLog } from "@/lib/audit";
import { autoSendEmailIfEnabled } from "@/lib/auto-send";
import { ensureClaimToken } from "@/lib/assignment-helpers";
import { getEventById } from "@/lib/db/repos/events";
import { assignPendingForEvent as assignPendingForEventRepo } from "@/lib/db/repos/grants";
import type { EmailConfig } from "@/lib/settings";

export { ensureClaimToken };

/**
 * Grants all enabled coupons to every attendee in the event that is still
 * missing at least one grant. One set-based SQL statement per enabled
 * coupon, replacing what used to be one Firestore transaction per
 * (attendee, coupon) pair — the single biggest source of Firestore
 * read/write volume in the app. Returns the number of attendees who
 * received at least one new grant.
 */
export async function assignPendingForEvent(
  eventId: string,
  emailConfig?: EmailConfig
): Promise<number> {
  const touchedAttendeeIds = await assignPendingForEventRepo(eventId);
  if (touchedAttendeeIds.length === 0) return 0;

  const event = await getEventById(eventId);

  await writeAuditLog({
    eventId,
    action: "coupon_granted",
    metadata: { attendeeCount: touchedAttendeeIds.length },
  });

  if (event?.autoSendEmail) {
    for (const attendeeId of touchedAttendeeIds) {
      await autoSendEmailIfEnabled(event, attendeeId, emailConfig);
    }
  }

  return touchedAttendeeIds.length;
}
