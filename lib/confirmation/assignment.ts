import { adminDb } from "@/lib/firebase/admin";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import {
  ConfirmationAssignResult,
  ConfirmationAttendee,
  ConfirmationVolunteer,
} from "@/lib/confirmation/types";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

const BATCH_LIMIT = 500;

/**
 * Pools together every attendee whose status is still "need_confirmation" or
 * "call_pending" (finished work — call_done / confirm_coming / not_coming — is
 * left untouched) and redistributes that pool across all currently active
 * volunteers.
 *
 * Attendees are grouped by `teamKey` first (an individual with no team is
 * treated as a team of one), so every member of a team is always assigned to
 * the *same* volunteer — nobody wants a teammate to be called twice by two
 * different volunteers, or to have a half-confirmed team. Groups are then
 * assigned largest-first to whichever volunteer currently has the smallest
 * total load (existing assignments + what's been handed out so far this run),
 * which keeps queues as balanced as team-sized chunks allow.
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

  const attendeesRef = adminDb.collection("confirmationAttendees");

  const [poolSnap, ...currentLoadSnaps] = await Promise.all([
    attendeesRef.where("status", "in", ["need_confirmation", "call_pending"]).get(),
    ...volunteers.map((v) =>
      attendeesRef.where("assignedVolunteerId", "==", v.id).count().get()
    ),
  ]);

  const perVolunteerCounts: Record<string, number> = {};
  const load = new Map<string, number>();
  volunteers.forEach((v, i) => {
    perVolunteerCounts[v.id] = 0;
    load.set(v.id, currentLoadSnaps[i].data().count);
  });

  // Group the pool by team so every teammate goes to the same volunteer.
  // Attendees with no teamKey are their own team of one.
  const groups = new Map<string, QueryDocumentSnapshot[]>();
  for (const doc of poolSnap.docs) {
    const attendee = doc.data() as ConfirmationAttendee;
    const groupKey = attendee.teamKey ?? `_solo_${doc.id}`;
    const group = groups.get(groupKey) ?? [];
    group.push(doc);
    groups.set(groupKey, group);
  }

  // Largest teams first (LPT-style greedy) so big teams don't land on an
  // already-loaded volunteer purely by chance of processing order.
  const sortedGroups = Array.from(groups.values()).sort(
    (a, b) => b.length - a.length
  );

  const now = new Date().toISOString();
  let totalAssigned = 0;
  let batch = adminDb.batch();
  let opsInBatch = 0;

  for (const group of sortedGroups) {
    // Pick whichever active volunteer currently has the smallest total load.
    let chosen = volunteers[0];
    for (const v of volunteers) {
      if ((load.get(v.id) ?? 0) < (load.get(chosen.id) ?? 0)) chosen = v;
    }

    for (const doc of group) {
      const attendee = doc.data() as ConfirmationAttendee;
      batch.update(doc.ref, {
        assignedVolunteerId: chosen.id,
        assignedVolunteerName: chosen.name,
        assignedAt: now,
        status:
          attendee.status === "need_confirmation" ? "call_pending" : attendee.status,
      });

      perVolunteerCounts[chosen.id] = (perVolunteerCounts[chosen.id] ?? 0) + 1;
      totalAssigned++;
      opsInBatch++;

      if (opsInBatch === BATCH_LIMIT) {
        await batch.commit();
        batch = adminDb.batch();
        opsInBatch = 0;
      }
    }

    load.set(chosen.id, (load.get(chosen.id) ?? 0) + group.length);
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
      teamCount: sortedGroups.length,
    },
  });

  return {
    volunteerCount: volunteers.length,
    totalAssigned,
    perVolunteerCounts,
  };
}
