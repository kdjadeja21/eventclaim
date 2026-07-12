import { adminDb } from "@/lib/firebase/admin";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import {
  ConfirmationAssignResult,
  ConfirmationAttendee,
  ConfirmationVolunteer,
} from "@/lib/confirmation/types";

const BATCH_LIMIT = 500;

/**
 * Pools together every attendee whose status is still "need_confirmation" or
 * "call_pending" (finished work — call_done / confirm_coming / not_coming — is
 * left untouched) and redistributes that pool evenly, round-robin, across all
 * currently active volunteers. Running this after adding a new volunteer pulls
 * a fair share away from existing volunteers' pending queues into the new
 * volunteer's queue.
 */
export async function assignConfirmationAttendees(
  actorId = "admin"
): Promise<ConfirmationAssignResult> {
  const volunteersSnap = await adminDb
    .collection("confirmationVolunteers")
    .where("isActive", "==", true)
    .orderBy("createdAt", "asc")
    .get();

  const volunteers = volunteersSnap.docs.map(
    (d) => d.data() as ConfirmationVolunteer
  );

  if (volunteers.length === 0) {
    return { volunteerCount: 0, totalAssigned: 0, perVolunteerCounts: {} };
  }

  const poolSnap = await adminDb
    .collection("confirmationAttendees")
    .where("status", "in", ["need_confirmation", "call_pending"])
    .get();

  const pool = poolSnap.docs;
  const perVolunteerCounts: Record<string, number> = {};
  for (const v of volunteers) perVolunteerCounts[v.id] = 0;

  const now = new Date().toISOString();
  let totalAssigned = 0;
  let batch = adminDb.batch();
  let opsInBatch = 0;

  for (let i = 0; i < pool.length; i++) {
    const doc = pool[i];
    const attendee = doc.data() as ConfirmationAttendee;
    const volunteer = volunteers[i % volunteers.length];

    batch.update(doc.ref, {
      assignedVolunteerId: volunteer.id,
      assignedVolunteerName: volunteer.name,
      assignedAt: now,
      status:
        attendee.status === "need_confirmation" ? "call_pending" : attendee.status,
    });

    perVolunteerCounts[volunteer.id] = (perVolunteerCounts[volunteer.id] ?? 0) + 1;
    totalAssigned++;
    opsInBatch++;

    if (opsInBatch === BATCH_LIMIT) {
      await batch.commit();
      batch = adminDb.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  await writeConfirmationAuditLog({
    action: "attendees_assigned",
    actorType: "admin",
    actorId,
    metadata: {
      volunteerCount: volunteers.length,
      totalAssigned,
      perVolunteerCounts,
    },
  });

  return {
    volunteerCount: volunteers.length,
    totalAssigned,
    perVolunteerCounts,
  };
}
