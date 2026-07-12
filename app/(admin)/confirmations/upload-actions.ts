"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import { parseConfirmationAttendeeCsv } from "@/lib/confirmation/csv";
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

  for (const row of rows) {
    const docRef = attendeesRef.doc(row.id);
    const existing = await docRef.get();

    if (existing.exists) {
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
    };

    await docRef.set(attendee);
    imported++;
  }

  await writeConfirmationAuditLog({
    action: "attendees_imported",
    actorType: "admin",
    actorId: session.uid,
    metadata: { imported, skipped, invalid: invalidCount },
  });

  revalidatePath("/confirmations");
  revalidatePath("/confirmations/attendees");

  return {
    imported,
    skipped,
    invalid: invalidCount,
    errors,
  };
}
