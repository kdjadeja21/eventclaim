"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import { parseConfirmationAttendeeCsv } from "@/lib/confirmation/csv";
import { resolveAndPersistConfirmationTeams } from "@/lib/confirmation/team-resolve-service";
import {
  ConfirmationAttendee,
  ConfirmationImportResult,
} from "@/lib/confirmation/types";
import { revalidatePath } from "next/cache";

export async function uploadConfirmationAttendees(
  csvText: string,
  opts: { onlyApproved: boolean } = { onlyApproved: true }
): Promise<ConfirmationImportResult> {
  const session = await requireSession();

  const { rows, invalidCount, skippedCount, errors } =
    parseConfirmationAttendeeCsv(csvText, opts);

  const attendeesRef = adminDb.collection("confirmationAttendees");

  let imported = 0;
  let skipped = skippedCount;
  let updated = 0;

  for (const row of rows) {
    const docRef = attendeesRef.doc(row.id);
    const existing = await docRef.get();

    if (existing.exists) {
      // Refresh team/contact fields from the CSV without wiping call progress
      // or volunteer assignment. A bad first import used to stick forever
      // because re-uploads skipped existing emails entirely.
      await docRef.update({
        name: row.name,
        ...(row.phone ? { phone: row.phone } : {}),
        extra: row.extra,
        teamIntent: row.teamIntent,
        ticketName: row.ticketName,
      });
      updated++;
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    const attendee: ConfirmationAttendee = {
      id: row.id,
      name: row.name,
      email: row.email,
      ...(row.phone ? { phone: row.phone } : {}),
      extra: row.extra,
      status: "need_confirmation",
      assignedVolunteerId: null,
      assignedVolunteerName: null,
      assignedAt: null,
      statusUpdatedAt: null,
      createdAt: now,
      teamIntent: row.teamIntent,
      ticketName: row.ticketName,
      teamKey: null,
      teamRole: null,
      inPool: false,
    };

    await docRef.set(attendee);
    imported++;
  }

  await writeConfirmationAuditLog({
    action: "attendees_imported",
    actorType: "admin",
    actorId: session.uid,
    metadata: { imported, skipped, updated, invalid: invalidCount },
  });

  // Re-run team resolution whenever anything was imported or team signals
  // refreshed, so leads/members link across batches.
  if (imported > 0 || updated > 0) {
    await resolveAndPersistConfirmationTeams(session.uid);
  }

  revalidatePath("/confirmations");
  revalidatePath("/confirmations/attendees");
  revalidatePath("/confirmations/teams");

  return {
    imported,
    skipped,
    invalid: invalidCount,
    errors,
  };
}
