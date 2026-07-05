import { adminDb } from "@/lib/firebase/admin";
import { normalizeEmail } from "@/lib/utils";
import {
  Registration,
  Team,
  TeamIssue,
  TeamSource,
  TeamStatus,
  TicketCategory,
} from "@/lib/types";
import { nanoid } from "nanoid";

export interface TeamBuildResult {
  teamsCreated: number;
  teamsUpdated: number;
  registrationsLinked: number;
}

interface TeamDraft {
  id: string;
  eventId: string;
  name: string;
  leadRegistrationId: string | null;
  leadEmail: string | null;
  memberRegistrationIds: string[];
  memberEmails: string[];
  expectedMemberEmails: string[];
  ticketCategory: TicketCategory;
  status: TeamStatus;
  source: TeamSource;
  issues: TeamIssue[];
}

function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const n = normalizeEmail(e);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

function computeTeamStatus(
  draft: Pick<TeamDraft, "leadRegistrationId" | "memberEmails" | "expectedMemberEmails" | "ticketCategory" | "issues" | "source">
): TeamStatus {
  if (draft.source === "manual") return "manual";
  if (draft.ticketCategory === "find_team" && !draft.leadRegistrationId) return "unassigned";
  if (draft.issues.includes("unmatched_lead") || draft.issues.includes("missing_member")) {
    return "incomplete";
  }
  if (draft.ticketCategory === "find_team") return "unassigned";
  return "complete";
}

export function buildTeamDraftsFromRegistrations(
  eventId: string,
  registrations: Registration[],
  existingTeams: Team[]
): { drafts: TeamDraft[]; registrationTeamMap: Map<string, string> } {
  const manualTeamIds = new Set(
    existingTeams.filter((t) => t.source === "manual").map((t) => t.id)
  );
  const manualRegIds = new Set(
    registrations.filter((r) => r.isManualMapping && r.teamId).map((r) => r.id)
  );

  const byEmail = new Map<string, Registration>();
  for (const reg of registrations) {
    byEmail.set(normalizeEmail(reg.email), reg);
  }

  const drafts = new Map<string, TeamDraft>();
  const registrationTeamMap = new Map<string, string>();

  // Preserve manual teams
  for (const team of existingTeams) {
    if (team.source !== "manual") continue;
    drafts.set(team.id, {
      id: team.id,
      eventId,
      name: team.name,
      leadRegistrationId: team.leadRegistrationId,
      leadEmail: team.leadEmail,
      memberRegistrationIds: [...team.memberRegistrationIds],
      memberEmails: [...team.memberEmails],
      expectedMemberEmails: [...team.expectedMemberEmails],
      ticketCategory: team.ticketCategory,
      status: "manual",
      source: "manual",
      issues: [...team.issues],
    });
    if (team.leadRegistrationId) registrationTeamMap.set(team.leadRegistrationId, team.id);
    for (const mid of team.memberRegistrationIds) {
      registrationTeamMap.set(mid, team.id);
    }
  }

  // Create Team leads
  for (const reg of registrations) {
    if (manualRegIds.has(reg.id)) continue;
    if (reg.ticketCategory !== "create_team" || reg.role !== "lead") continue;

    const teamId = `team-${reg.id}`;
    const expected = uniqueEmails(reg.parsedTeamEmails);
    const issues: TeamIssue[] = [];

    if (reg.teamAnswerRaw.trim() && expected.length === 0 && !reg.teamAnswerRaw.match(/^individual/i)) {
      issues.push("invalid_team_answer");
    }

    const memberIds: string[] = [];
    const memberEmails: string[] = [];
    for (const email of expected) {
      const memberReg = byEmail.get(email);
      if (memberReg) {
        memberIds.push(memberReg.id);
        memberEmails.push(memberReg.email);
        registrationTeamMap.set(memberReg.id, teamId);
      } else {
        issues.push("missing_member");
      }
    }

    registrationTeamMap.set(reg.id, teamId);

    drafts.set(teamId, {
      id: teamId,
      eventId,
      name: `${reg.name}'s Team`,
      leadRegistrationId: reg.id,
      leadEmail: reg.email,
      memberRegistrationIds: memberIds,
      memberEmails,
      expectedMemberEmails: expected,
      ticketCategory: "create_team",
      status: "incomplete",
      source: "auto",
      issues,
    });
  }

  // Join Team members
  for (const reg of registrations) {
    if (manualRegIds.has(reg.id)) continue;
    if (reg.ticketCategory !== "join_team" || reg.role !== "member") continue;

    const leadEmail = reg.parsedTeamLeadEmail;
    if (!leadEmail) {
      const teamId = `team-solo-${reg.id}`;
      drafts.set(teamId, {
        id: teamId,
        eventId,
        name: reg.name,
        leadRegistrationId: null,
        leadEmail: null,
        memberRegistrationIds: [reg.id],
        memberEmails: [reg.email],
        expectedMemberEmails: [],
        ticketCategory: "join_team",
        status: "incomplete",
        source: "auto",
        issues: ["unmatched_lead", "invalid_team_answer"],
      });
      registrationTeamMap.set(reg.id, teamId);
      continue;
    }

    const leadReg = byEmail.get(normalizeEmail(leadEmail));
    let teamId: string | null = null;

    if (leadReg) {
      teamId = `team-${leadReg.id}`;
      if (!drafts.has(teamId)) {
        drafts.set(teamId, {
          id: teamId,
          eventId,
          name: `${leadReg.name}'s Team`,
          leadRegistrationId: leadReg.id,
          leadEmail: leadReg.email,
          memberRegistrationIds: [],
          memberEmails: [],
          expectedMemberEmails: [],
          ticketCategory: leadReg.ticketCategory === "create_team" ? "create_team" : "join_team",
          status: "incomplete",
          source: "auto",
          issues: [],
        });
        registrationTeamMap.set(leadReg.id, teamId);
      }
    } else {
      teamId = `team-pending-${normalizeEmail(leadEmail).replace(/[^a-z0-9]/g, "-")}`;
      if (!drafts.has(teamId)) {
        drafts.set(teamId, {
          id: teamId,
          eventId,
          name: `Pending: ${leadEmail}`,
          leadRegistrationId: null,
          leadEmail: normalizeEmail(leadEmail),
          memberRegistrationIds: [],
          memberEmails: [],
          expectedMemberEmails: [],
          ticketCategory: "join_team",
          status: "incomplete",
          source: "auto",
          issues: ["unmatched_lead"],
        });
      }
    }

    const draft = drafts.get(teamId!)!;
    if (!draft.memberRegistrationIds.includes(reg.id)) {
      draft.memberRegistrationIds.push(reg.id);
      draft.memberEmails.push(reg.email);
    }
    registrationTeamMap.set(reg.id, teamId!);

    if (!leadReg) draft.issues = uniqueIssues([...draft.issues, "unmatched_lead"]);
  }

  // Find Team individuals
  for (const reg of registrations) {
    if (manualRegIds.has(reg.id)) continue;
    if (reg.ticketCategory !== "find_team") continue;
    if (registrationTeamMap.has(reg.id)) continue;

    const teamId = `team-ind-${reg.id}`;
    drafts.set(teamId, {
      id: teamId,
      eventId,
      name: reg.name,
      leadRegistrationId: reg.id,
      leadEmail: reg.email,
      memberRegistrationIds: [],
      memberEmails: [],
      expectedMemberEmails: [],
      ticketCategory: "find_team",
      status: "unassigned",
      source: "auto",
      issues: [],
    });
    registrationTeamMap.set(reg.id, teamId);
  }

  // Unknown ticket / individual role without team
  for (const reg of registrations) {
    if (manualRegIds.has(reg.id)) continue;
    if (registrationTeamMap.has(reg.id)) continue;

    const teamId = `team-ind-${reg.id}`;
    const issues: TeamIssue[] =
      reg.teamAnswerRaw.trim() && !reg.teamAnswerRaw.match(/^individual/i)
        ? ["invalid_team_answer"]
        : [];

    drafts.set(teamId, {
      id: teamId,
      eventId,
      name: reg.name,
      leadRegistrationId: reg.id,
      leadEmail: reg.email,
      memberRegistrationIds: [],
      memberEmails: [],
      expectedMemberEmails: [],
      ticketCategory: reg.ticketCategory === "unknown" ? "find_team" : reg.ticketCategory,
      status: "unassigned",
      source: "auto",
      issues,
    });
    registrationTeamMap.set(reg.id, teamId);
  }

  // Finalize status and merge with existing auto teams (preserve admin-added members on auto teams)
  for (const [teamId, draft] of drafts) {
    if (manualTeamIds.has(teamId)) continue;

    const existing = existingTeams.find((t) => t.id === teamId);
    if (existing && existing.source === "auto") {
      for (const mid of existing.memberRegistrationIds) {
        if (!draft.memberRegistrationIds.includes(mid)) {
          draft.memberRegistrationIds.push(mid);
          const memberReg = registrations.find((r) => r.id === mid);
          if (memberReg) draft.memberEmails.push(memberReg.email);
        }
      }
    }

    draft.memberEmails = uniqueEmails(draft.memberEmails);
    draft.issues = uniqueIssues(draft.issues);
    draft.status = computeTeamStatus(draft);
  }

  return { drafts: Array.from(drafts.values()), registrationTeamMap };
}

function uniqueIssues(issues: TeamIssue[]): TeamIssue[] {
  return [...new Set(issues)];
}

export async function applyTeamBuild(
  eventId: string,
  registrations: Registration[],
  existingTeams: Team[]
): Promise<TeamBuildResult> {
  const { drafts, registrationTeamMap } = buildTeamDraftsFromRegistrations(
    eventId,
    registrations,
    existingTeams
  );

  const existingById = new Map(existingTeams.map((t) => [t.id, t]));
  let teamsCreated = 0;
  let teamsUpdated = 0;
  const now = new Date().toISOString();

  const batch = adminDb.batch();
  const teamsRef = adminDb.collection("events").doc(eventId).collection("teams");

  for (const draft of drafts) {
    const existing = existingById.get(draft.id);
    const team: Team = {
      ...draft,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    batch.set(teamsRef.doc(draft.id), team, { merge: true });
    if (existing) teamsUpdated++;
    else teamsCreated++;
  }

  // Remove stale auto teams no longer in drafts (not manual)
  for (const existing of existingTeams) {
    if (existing.source === "manual") continue;
    if (!drafts.find((d) => d.id === existing.id)) {
      batch.delete(teamsRef.doc(existing.id));
    }
  }

  await batch.commit();

  // Update registration teamId links (skip manual mappings)
  const regBatch = adminDb.batch();
  let registrationsLinked = 0;
  const regsRef = adminDb.collection("events").doc(eventId).collection("registrations");

  for (const reg of registrations) {
    if (reg.isManualMapping) continue;
    const newTeamId = registrationTeamMap.get(reg.id) ?? null;
    if (reg.teamId !== newTeamId) {
      regBatch.update(regsRef.doc(reg.id), { teamId: newTeamId, updatedAt: now });
      registrationsLinked++;
    }
  }

  if (registrationsLinked > 0) await regBatch.commit();

  return { teamsCreated, teamsUpdated, registrationsLinked };
}

export function newManualTeamId(): string {
  return `team-manual-${nanoid(10)}`;
}
