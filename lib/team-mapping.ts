import { adminDb } from "@/lib/firebase/admin";
import { hydrateRegistration } from "@/lib/registrations";
import {
  computeFormationStats,
  resolveTeamsFromRegistrations,
  TeamDraft,
} from "@/lib/team-resolver";
import {
  Event,
  Registration,
  Team,
  TeamLink,
  TeamRules,
} from "@/lib/types";
import { normalizeEmail } from "@/lib/utils";
import { nanoid } from "nanoid";

export interface TeamBuildResult {
  teamsCreated: number;
  teamsUpdated: number;
  registrationsLinked: number;
  poolCount: number;
}

export function newManualTeamId(): string {
  return `team-manual-${nanoid(10)}`;
}

async function loadConfirmedAliases(eventId: string): Promise<Map<string, string>> {
  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("teamLinks")
    .get();

  const aliases = new Map<string, string>();
  for (const doc of snap.docs) {
    const link = doc.data() as TeamLink;
    if (link.toRegistrationId) {
      aliases.set(normalizeEmail(link.toEmail), link.toRegistrationId);
    }
  }
  return aliases;
}

export async function applyTeamBuild(
  eventId: string,
  registrations: Registration[],
  existingTeams: Team[],
  event?: Pick<Event, "teamRules">
): Promise<TeamBuildResult> {
  const confirmedAliases = await loadConfirmedAliases(eventId);
  const hydrated = registrations.map(hydrateRegistration);

  const { drafts, registrationTeamMap, poolRegistrationIds } = resolveTeamsFromRegistrations(
    eventId,
    hydrated,
    existingTeams,
    { teamRules: event?.teamRules, confirmedAliases }
  );

  const existingById = new Map(existingTeams.map((t) => [t.id, t]));
  let teamsCreated = 0;
  let teamsUpdated = 0;
  const now = new Date().toISOString();

  const batch = adminDb.batch();
  const teamsRef = adminDb.collection("events").doc(eventId).collection("teams");

  for (const draft of drafts) {
    const existing = existingById.get(draft.id);
    const team: Team = draftToTeam(draft, existing, now);
    batch.set(teamsRef.doc(draft.id), team, { merge: true });
    if (existing) teamsUpdated++;
    else teamsCreated++;
  }

  // Remove stale auto teams
  const draftIds = new Set(drafts.map((d) => d.id));
  for (const existing of existingTeams) {
    if (existing.source === "manual") continue;
    if (!draftIds.has(existing.id)) {
      batch.delete(teamsRef.doc(existing.id));
    }
  }

  await batch.commit();

  // Update registration links
  const regBatch = adminDb.batch();
  let registrationsLinked = 0;
  const regsRef = adminDb.collection("events").doc(eventId).collection("registrations");

  for (const reg of hydrated) {
    if (reg.isManualMapping) continue;
    const newTeamId = registrationTeamMap.get(reg.id) ?? null;
    const inPool = poolRegistrationIds.has(reg.id);
    const updates: Partial<Registration> = { updatedAt: now };
    let changed = false;

    if (reg.teamId !== newTeamId) {
      updates.teamId = newTeamId;
      changed = true;
    }
    if (reg.inPool !== inPool) {
      updates.inPool = inPool;
      changed = true;
    }

    if (changed) {
      regBatch.update(regsRef.doc(reg.id), updates);
      registrationsLinked++;
    }
  }

  if (registrationsLinked > 0) await regBatch.commit();

  return {
    teamsCreated,
    teamsUpdated,
    registrationsLinked,
    poolCount: poolRegistrationIds.size,
  };
}

function draftToTeam(draft: TeamDraft, existing: Team | undefined, now: string): Team {
  return {
    id: draft.id,
    eventId: draft.eventId,
    name: draft.name,
    leadRegistrationId: draft.leadRegistrationId,
    leadEmail: draft.leadEmail,
    memberRegistrationIds: draft.memberRegistrationIds,
    memberEmails: draft.memberEmails,
    expectedMemberEmails: draft.expectedMemberEmails,
    ticketCategory: draft.ticketCategory,
    status: draft.status,
    source: draft.source,
    issues: draft.issues,
    confidence: draft.confidence,
    suggestedLinks: draft.suggestedLinks,
    sizeExpected: draft.sizeExpected,
    sizeActual: draft.sizeActual,
    reviewSummary: draft.reviewSummary,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export { computeFormationStats, resolveTeamsFromRegistrations };

export const DEFAULT_TEAM_RULES: TeamRules = {
  minSize: 3,
  maxSize: 4,
  allowOversized: false,
};
