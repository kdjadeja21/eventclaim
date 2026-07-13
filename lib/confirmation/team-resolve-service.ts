import { adminDb } from "@/lib/firebase/admin";
import type { WriteBatch } from "firebase-admin/firestore";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import {
  computeAttendeeTeamFields,
  computeTeamFormationStats,
  resolveConfirmationTeams,
} from "@/lib/confirmation/team-resolver";
import {
  ConfirmationAttendee,
  ConfirmationTeamFormationStats,
  ConfirmationTeamRules,
  DEFAULT_TEAM_RULES,
} from "@/lib/confirmation/types";

const BATCH_LIMIT = 500;

async function commitInBatches(ops: Array<(batch: WriteBatch) => void>): Promise<void> {
  let batch = adminDb.batch();
  let count = 0;
  for (const op of ops) {
    op(batch);
    count++;
    if (count === BATCH_LIMIT) {
      await batch.commit();
      batch = adminDb.batch();
      count = 0;
    }
  }
  if (count > 0) await batch.commit();
}

/**
 * Re-runs team resolution across every current attendee (not just one CSV
 * upload), persists the computed teams to `confirmationTeams`, and updates
 * each attendee's teamKey/teamRole/inPool. Safe to call repeatedly — old team
 * docs are cleared and replaced with the freshly computed set each time.
 */
export async function resolveAndPersistConfirmationTeams(
  actorId = "admin",
  rules: ConfirmationTeamRules = DEFAULT_TEAM_RULES
): Promise<ConfirmationTeamFormationStats> {
  const attendeesSnap = await adminDb.collection("confirmationAttendees").get();
  const attendees = attendeesSnap.docs.map((d) => d.data() as ConfirmationAttendee);

  const output = resolveConfirmationTeams(attendees, rules);

  const existingTeamsSnap = await adminDb.collection("confirmationTeams").get();

  const ops: Array<(batch: WriteBatch) => void> = [];

  for (const doc of existingTeamsSnap.docs) {
    ops.push((batch) => batch.delete(doc.ref));
  }

  for (const team of output.teams) {
    const ref = adminDb.collection("confirmationTeams").doc(team.id);
    ops.push((batch) => batch.set(ref, team));
  }

  const updatedAttendees: ConfirmationAttendee[] = [];
  for (const attendee of attendees) {
    const fields = computeAttendeeTeamFields(attendee, output);
    if (
      attendee.teamKey !== fields.teamKey ||
      attendee.teamRole !== fields.teamRole ||
      attendee.inPool !== fields.inPool
    ) {
      const ref = adminDb.collection("confirmationAttendees").doc(attendee.id);
      ops.push((batch) => batch.update(ref, fields));
    }
    updatedAttendees.push({ ...attendee, ...fields });
  }

  await commitInBatches(ops);

  const stats = computeTeamFormationStats(output.teams, updatedAttendees);

  await writeConfirmationAuditLog({
    action: "teams_resolved",
    actorType: "admin",
    actorId,
    metadata: {
      formedTeams: stats.formedTeams,
      completeTeams: stats.completeTeams,
      incompleteTeams: stats.incompleteTeams,
      needsReviewTeams: stats.needsReviewTeams,
      poolCount: stats.poolCount,
    },
  });

  return stats;
}
