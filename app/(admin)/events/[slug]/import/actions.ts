"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { assignPendingForEvent } from "@/lib/assignment";
import { parseLumaAttendeeCsv, attendeeDocId } from "@/lib/import";
import { Attendee, AttendeeImportResult } from "@/lib/types";

async function resolveEventId(slug: string): Promise<string> {
  const snap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) throw new Error(`Event not found: ${slug}`);
  return snap.docs[0].id;
}

export async function importAttendees(
  slug: string,
  csvText: string,
  checkedInOnly: boolean
): Promise<AttendeeImportResult> {
  const session = await requireSession();
  const eventId = await resolveEventId(slug);

  const { rows, invalidCount, errors } = parseLumaAttendeeCsv(
    csvText,
    checkedInOnly
  );

  let imported = 0;
  let skipped = 0;

  const attendeesRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees");

  for (const row of rows) {
    const docId = attendeeDocId(eventId, row.email);
    const docRef = attendeesRef.doc(docId);
    const existing = await docRef.get();

    if (existing.exists) {
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    const attendee: Attendee = {
      id: docId,
      eventId,
      name: row.name,
      email: row.email,
      grantCount: 0,
      claimedCount: 0,
      claimedAny: false,
      emailStatus: "pending",
      emailSentAt: null,
      claimToken: null,
      createdAt: now,
    };

    await docRef.set(attendee);
    imported++;
  }

  await writeAuditLog({
    eventId,
    action: "attendee_imported",
    metadata: { imported, skipped, invalid: invalidCount },
    userId: session.uid,
  });

  // Grant all coupons to newly-imported attendees
  const assigned = await assignPendingForEvent(eventId);

  return {
    imported,
    skipped,
    invalid: invalidCount,
    waitingForCoupon: imported - assigned,
    assigned,
    errors,
  };
}
