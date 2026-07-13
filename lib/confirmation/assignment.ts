import { adminDb } from "@/lib/firebase/admin";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import { resolveAndPersistConfirmationTeams } from "@/lib/confirmation/team-resolve-service";
import {
  ConfirmationAssignResult,
  ConfirmationAttendee,
  ConfirmationVolunteer,
} from "@/lib/confirmation/types";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

const BATCH_LIMIT = 500;

function pickLeastLoadedVolunteer(
  volunteers: ConfirmationVolunteer[],
  load: Map<string, number>
): ConfirmationVolunteer {
  let chosen = volunteers[0];
  for (const v of volunteers) {
    if ((load.get(v.id) ?? 0) < (load.get(chosen.id) ?? 0)) chosen = v;
  }
  return chosen;
}

/**
 * Assigns every currently unassigned attendee across active volunteers.
 *
 * Before assigning, re-resolves teams so `teamKey` is up to date. Attendees
 * are then grouped by `teamKey` (an individual with no team is a group of
 * one) and each whole group is handed to a single volunteer — teammates are
 * never split. Groups are assigned largest-first to whichever volunteer
 * currently has the smallest load (existing assignments + this run).
 *
 * Already-assigned attendees are left alone so mid-campaign rebalances don't
 * yank people between volunteers.
 */
export async function assignConfirmationAttendees(
  actorId = "admin"
): Promise<ConfirmationAssignResult> {
  // Ensure teamKey is fresh before grouping — otherwise every row looks like
  // a solo assignment even when teams exist on the Teams page.
  await resolveAndPersistConfirmationTeams(actorId);

  const volunteersSnap = await adminDb.collection("confirmationVolunteers").get();

  // Filter + sort in memory so we don't need a composite Firestore index on
  // (isActive, createdAt) — a missing index was causing Assign to fail silently.
  const volunteers = volunteersSnap.docs
    .map((d) => d.data() as ConfirmationVolunteer)
    .filter((v) => v.isActive)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

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

  // Only unassigned attendees — never steal someone else's queue.
  const unassignedDocs = poolSnap.docs.filter((doc) => {
    const attendee = doc.data() as ConfirmationAttendee;
    return !attendee.assignedVolunteerId;
  });

  // Group by team so every teammate goes to the same volunteer.
  // Attendees with no teamKey are their own team of one.
  const groups = new Map<string, QueryDocumentSnapshot[]>();
  for (const doc of unassignedDocs) {
    const attendee = doc.data() as ConfirmationAttendee;
    const groupKey = attendee.teamKey ?? `_solo_${doc.id}`;
    const group = groups.get(groupKey) ?? [];
    group.push(doc);
    groups.set(groupKey, group);
  }

  // Largest teams first (LPT-style greedy).
  const sortedGroups = Array.from(groups.values()).sort(
    (a, b) => b.length - a.length
  );

  const now = new Date().toISOString();
  let totalAssigned = 0;
  let batch = adminDb.batch();
  let opsInBatch = 0;

  // Assign one group at a time so a team is never split across volunteers
  // even if a batch commit boundary falls mid-run.
  for (const group of sortedGroups) {
    const chosen = pickLeastLoadedVolunteer(volunteers, load);

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
