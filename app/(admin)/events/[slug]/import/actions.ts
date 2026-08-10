"use server";

import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { assignPendingForEvent } from "@/lib/assignment";
import { parseLumaAttendeeCsv, attendeeDocId } from "@/lib/import";
import { AttendeeImportResult } from "@/lib/types";
import { bulkInsertAttendees } from "@/lib/db/repos/attendees";
import { resolveEventIdForUser } from "@/lib/db/repos/events";
import type { EmailConfig } from "@/lib/settings";

export async function importAttendees(
  slug: string,
  csvText: string,
  checkedInOnly: boolean,
  emailConfig?: EmailConfig
): Promise<AttendeeImportResult> {
  const session = await requireSession();
  const eventId = await resolveEventIdForUser(slug, session.uid);

  const { rows, invalidCount, errors } = parseLumaAttendeeCsv(csvText, checkedInOnly);

  const now = new Date().toISOString();
  const { insertedCount: imported, skippedCount: skipped } = await bulkInsertAttendees(
    rows.map((row) => ({
      id: attendeeDocId(eventId, row.email),
      eventId,
      name: row.name,
      email: row.email,
      createdAt: now,
    }))
  );

  await writeAuditLog({
    eventId,
    action: "attendee_imported",
    metadata: { imported, skipped, invalid: invalidCount },
    userId: session.uid,
  });

  // Grant all coupons to newly-imported attendees — one set-based statement
  // per enabled coupon instead of one insert per (attendee, coupon) pair.
  const assigned = await assignPendingForEvent(eventId, emailConfig);

  return {
    imported,
    skipped,
    invalid: invalidCount,
    waitingForCoupon: imported - assigned,
    assigned,
    errors,
  };
}
