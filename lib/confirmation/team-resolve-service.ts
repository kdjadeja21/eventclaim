import { adminDb } from "@/lib/firebase/admin";
import type { WriteBatch } from "firebase-admin/firestore";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import { recoverTeamIntentFromAttendee } from "@/lib/confirmation/csv";
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

function teamIntentChanged(
  before: ConfirmationAttendee["teamIntent"],
  after: ConfirmationAttendee["teamIntent"]
): boolean {
  if (!before && !after) return false;
  if (!before || !after) return true;
  return (
    before.kind !== after.kind ||
    before.quality !== after.quality ||
    (before.rawValue ?? null) !== (after.rawValue ?? null) ||
    JSON.stringify(before.referencedEmails ?? []) !==
      JSON.stringify(after.referencedEmails ?? [])
  );
}

/**
 * Re-runs team resolution across every current attendee (not just one CSV
 * upload), persists the computed teams to `confirmationTeams`, and updates
 * each attendee's teamKey/teamRole/inPool (and refreshed teamIntent when
 * recovery/reclassification changed it). Safe to call repeatedly — old team
 * docs are cleared and replaced with the freshly computed set each time.
 */
export async function resolveAndPersistConfirmationTeams(
  actorId = "admin",
  rules: ConfirmationTeamRules = DEFAULT_TEAM_RULES
): Promise<ConfirmationTeamFormationStats> {
  const attendeesSnap = await adminDb.collection("confirmationAttendees").get();
  const attendees = attendeesSnap.docs.map((d) => d.data() as ConfirmationAttendee);

  // Apply the same recovery the resolver uses so we can persist improved
  // teamIntent fields back onto attendee docs.
  const recoveredAttendees = attendees.map((a) => ({
    ...a,
    teamIntent: recoverTeamIntentFromAttendee(a),
  }));

  const output = resolveConfirmationTeams(recoveredAttendees, rules);

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
  for (let i = 0; i < attendees.length; i++) {
    const original = attendees[i];
    const recovered = recoveredAttendees[i];
    const fields = computeAttendeeTeamFields(recovered, output);
    const intentChanged = teamIntentChanged(original.teamIntent, recovered.teamIntent);
    const assignmentChanged =
      original.teamKey !== fields.teamKey ||
      original.teamRole !== fields.teamRole ||
      original.inPool !== fields.inPool;

    if (intentChanged || assignmentChanged) {
      const ref = adminDb.collection("confirmationAttendees").doc(original.id);
      ops.push((batch) =>
        batch.update(ref, {
          ...fields,
          ...(intentChanged ? { teamIntent: recovered.teamIntent } : {}),
        })
      );
    }

    updatedAttendees.push({
      ...original,
      ...fields,
      teamIntent: recovered.teamIntent,
    });
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
