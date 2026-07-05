import { suggestEmailMatches } from "@/lib/email-match";
import { hydrateRegistration, ISSUE_LABELS } from "@/lib/registrations";
import { normalizeEmail } from "@/lib/utils";
import {
  Registration,
  SuggestedLink,
  Team,
  TeamIssue,
  TeamRules,
  TeamSource,
  TeamStatus,
  TicketCategory,
} from "@/lib/types";

export interface ResolverOptions {
  teamRules?: TeamRules;
  confirmedAliases?: Map<string, string>;
}

export interface TeamDraft {
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
  confidence: number;
  suggestedLinks: SuggestedLink[];
  sizeExpected: number;
  sizeActual: number;
  reviewSummary?: string;
}

export interface ResolverResult {
  drafts: TeamDraft[];
  registrationTeamMap: Map<string, string | null>;
  poolRegistrationIds: Set<string>;
}

const DEFAULT_RULES: TeamRules = {
  minSize: 3,
  maxSize: 4,
  allowOversized: false,
};

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let curr = x;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
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

function uniqueIssues(issues: TeamIssue[]): TeamIssue[] {
  return [...new Set(issues)];
}

function computeStatus(
  draft: Pick<TeamDraft, "source" | "issues" | "leadRegistrationId" | "memberRegistrationIds">
): TeamStatus {
  if (draft.source === "manual") return "manual";
  if (
    draft.issues.includes("duplicate_member") ||
    draft.issues.includes("fuzzy_match_pending") ||
    draft.issues.includes("no_lead")
  ) {
    return "needs_review";
  }
  if (!draft.leadRegistrationId && draft.memberRegistrationIds.length > 0) {
    return "needs_review";
  }
  if (draft.issues.includes("unmatched_lead") || draft.issues.includes("missing_member")) {
    return "incomplete";
  }
  if (draft.issues.includes("size_under") || draft.issues.includes("size_over")) {
    return "incomplete";
  }
  if (draft.issues.length > 0) return "incomplete";
  return "complete";
}

function buildReviewSummary(draft: TeamDraft): string {
  if (draft.issues.length === 0) return "";
  return ISSUE_LABELS[draft.issues[0]] ?? draft.issues[0];
}

function scoreLeadCandidate(reg: Registration, inboundLeadEdges: number): number {
  const intent = reg.teamIntent!;
  let score = 0;
  if (intent.kind === "lead") score += 3;
  if (reg.rawTicketCategory === "create_team") score += 2;
  score += inboundLeadEdges;
  if (reg.rawTicketCategory === "find_team" && inboundLeadEdges > 0) score += 3;
  if (intent.kind === "member" && reg.rawTicketCategory === "join_team") score -= 2;
  if (intent.kind === "individual" && inboundLeadEdges === 0) score -= 5;
  return score;
}

export function resolveTeamsFromRegistrations(
  eventId: string,
  rawRegistrations: Registration[],
  existingTeams: Team[],
  options: ResolverOptions = {}
): ResolverResult {
  const rules = options.teamRules ?? DEFAULT_RULES;
  const confirmedAliases = options.confirmedAliases ?? new Map<string, string>();

  const registrations = rawRegistrations.map(hydrateRegistration);
  const manualRegIds = new Set(
    registrations.filter((r) => r.isManualMapping && r.teamId).map((r) => r.id)
  );

  const byId = new Map<string, Registration>();
  const emailToRegId = new Map<string, string>();
  for (const reg of registrations) {
    byId.set(reg.id, reg);
    emailToRegId.set(normalizeEmail(reg.email), reg.id);
  }

  const drafts = new Map<string, TeamDraft>();
  const registrationTeamMap = new Map<string, string | null>();
  const poolRegistrationIds = new Set<string>();
  const uf = new UnionFind();
  const duplicateMembers = new Set<string>();

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
      confidence: team.confidence ?? 1,
      suggestedLinks: team.suggestedLinks ?? [],
      sizeExpected: team.sizeExpected ?? team.expectedMemberEmails.length + 1,
      sizeActual:
        team.sizeActual ?? team.memberRegistrationIds.length + (team.leadRegistrationId ? 1 : 0),
      reviewSummary: team.reviewSummary,
    });
    if (team.leadRegistrationId) registrationTeamMap.set(team.leadRegistrationId, team.id);
    for (const mid of team.memberRegistrationIds) registrationTeamMap.set(mid, team.id);
  }

  const expectedMembersByLead = new Map<string, string[]>();
  const inboundLeadCount = new Map<string, number>();

  for (const reg of registrations) {
    if (manualRegIds.has(reg.id)) continue;
    const intent = reg.teamIntent!;
    uf.find(reg.id);

    if (intent.kind === "lead") {
      expectedMembersByLead.set(reg.id, intent.referencedEmails);
      for (const email of intent.referencedEmails) {
        const targetId =
          confirmedAliases.get(normalizeEmail(email)) ??
          emailToRegId.get(normalizeEmail(email));
        if (targetId) {
          uf.union(reg.id, targetId);
          inboundLeadCount.set(targetId, (inboundLeadCount.get(targetId) ?? 0) + 1);
        }
      }
    } else if (intent.kind === "member") {
      for (const email of intent.referencedEmails) {
        const targetId =
          confirmedAliases.get(normalizeEmail(email)) ??
          emailToRegId.get(normalizeEmail(email));
        if (targetId) {
          uf.union(reg.id, targetId);
          inboundLeadCount.set(targetId, (inboundLeadCount.get(targetId) ?? 0) + 1);
        }
      }
    }
  }

  const componentMembers = new Map<string, string[]>();

  for (const reg of registrations) {
    if (manualRegIds.has(reg.id)) continue;
    const intent = reg.teamIntent!;
    const hasInboundLead = (inboundLeadCount.get(reg.id) ?? 0) > 0;
    if (intent.kind === "individual" && !hasInboundLead) continue;

    const hasRegisteredEdge =
      intent.kind === "lead"
        ? intent.referencedEmails.some((e) => emailToRegId.has(normalizeEmail(e)))
        : intent.referencedEmails.some((e) => emailToRegId.has(normalizeEmail(e)));

    if (!hasRegisteredEdge && intent.kind === "member") {
      const teamId = `team-review-${reg.id}`;
      if (!drafts.has(teamId)) {
        const suggestedLinks: SuggestedLink[] = [];
        const issues: TeamIssue[] = ["unmatched_lead"];
        const phantom = intent.referencedEmails[0];
        if (phantom) {
          const suggestions = suggestEmailMatches(
            phantom,
            registrations.map((r) => ({ email: r.email, registrationId: r.id }))
          );
          if (suggestions.length > 0) {
            issues.push("fuzzy_match_pending");
            for (const s of suggestions) {
              suggestedLinks.push({
                fromEmail: phantom,
                toRegistrationId: s.registrationId,
                toEmail: s.email,
                score: s.score,
                reason: s.reason,
              });
            }
          }
        }
        drafts.set(teamId, {
          id: teamId,
          eventId,
          name: `${reg.name} (unmatched)`,
          leadRegistrationId: null,
          leadEmail: phantom ?? null,
          memberRegistrationIds: [reg.id],
          memberEmails: [reg.email],
          expectedMemberEmails: [],
          ticketCategory: "join_team",
          status: "needs_review",
          source: "auto",
          issues,
          confidence: 0.4,
          suggestedLinks,
          sizeExpected: rules.minSize,
          sizeActual: 1,
          reviewSummary: ISSUE_LABELS.unmatched_lead,
        });
        registrationTeamMap.set(reg.id, teamId);
      }
      continue;
    }

    if (!hasRegisteredEdge && intent.kind === "lead" && intent.referencedEmails.length === 0) {
      continue;
    }

    const root = uf.find(reg.id);
    if (!componentMembers.has(root)) componentMembers.set(root, []);
    if (!componentMembers.get(root)!.includes(reg.id)) {
      componentMembers.get(root)!.push(reg.id);
    }
  }

  for (const [, memberIds] of componentMembers) {
    if (memberIds.length === 0) continue;
    const members = memberIds.map((id) => byId.get(id)!).filter(Boolean);
    if (members.length === 0) continue;

    const leadScores = members.map((m) => ({
      reg: m,
      score: scoreLeadCandidate(m, inboundLeadCount.get(m.id) ?? 0),
    }));
    leadScores.sort((a, b) => b.score - a.score);
    const topScore = leadScores[0]?.score ?? -999;
    const tiedLeads = leadScores.filter((s) => s.score === topScore && s.score > 0);

    const issues: TeamIssue[] = [];
    const suggestedLinks: SuggestedLink[] = [];
    let leadReg: Registration;

    if (tiedLeads.length === 0 || topScore <= 0) {
      issues.push("no_lead");
      leadReg = leadScores[0]?.reg ?? members[0];
    } else if (tiedLeads.length > 1) {
      issues.push("no_lead");
      leadReg = tiedLeads[0].reg;
    } else {
      leadReg = tiedLeads[0].reg;
    }

    const teamId = `team-${leadReg.id}`;
    const otherMembers = members.filter((m) => m.id !== leadReg.id);
    const expectedFromLead = expectedMembersByLead.get(leadReg.id) ?? [];

    for (const email of expectedFromLead) {
      if (!emailToRegId.has(normalizeEmail(email))) {
        issues.push("missing_member");
        const suggestions = suggestEmailMatches(
          email,
          registrations.map((r) => ({ email: r.email, registrationId: r.id }))
        );
        if (suggestions.length > 0) {
          issues.push("fuzzy_match_pending");
          for (const s of suggestions) {
            suggestedLinks.push({
              fromEmail: email,
              toRegistrationId: s.registrationId,
              toEmail: s.email,
              score: s.score,
              reason: s.reason,
            });
          }
        }
      }
    }

    for (const m of members) {
      if (m.reviewFlags?.includes("ticket_mismatch")) issues.push("ticket_mismatch");
    }

    const memberIdsList = otherMembers.map((m) => m.id);
    const memberEmailsList = otherMembers.map((m) => m.email);
    const sizeActual = memberIdsList.length + 1;

    if (sizeActual < rules.minSize) issues.push("size_under");
    if (sizeActual > rules.maxSize && !rules.allowOversized) issues.push("size_over");

    const confidence =
      members.reduce((sum, m) => sum + (m.teamIntent?.confidence ?? 0.5), 0) / members.length;

    const draft: TeamDraft = {
      id: teamId,
      eventId,
      name: `${leadReg.name}'s Team`,
      leadRegistrationId: leadReg.id,
      leadEmail: leadReg.email,
      memberRegistrationIds: memberIdsList,
      memberEmails: memberEmailsList,
      expectedMemberEmails: expectedFromLead.filter(
        (e) => normalizeEmail(e) !== normalizeEmail(leadReg.email)
      ),
      ticketCategory:
        leadReg.ticketCategory === "find_team" ? "create_team" : leadReg.ticketCategory,
      status: "incomplete",
      source: "auto",
      issues: uniqueIssues(issues),
      confidence,
      suggestedLinks,
      sizeExpected: Math.max(expectedFromLead.length + 1, rules.minSize),
      sizeActual,
    };

    draft.status = computeStatus(draft);
    draft.reviewSummary = buildReviewSummary(draft);

    const existing = existingTeams.find((t) => t.id === teamId);
    if (existing && existing.source === "auto") {
      for (const mid of existing.memberRegistrationIds) {
        if (!draft.memberRegistrationIds.includes(mid)) {
          draft.memberRegistrationIds.push(mid);
          const m = byId.get(mid);
          if (m) draft.memberEmails.push(m.email);
        }
      }
      draft.memberEmails = uniqueEmails(draft.memberEmails);
      draft.sizeActual = draft.memberRegistrationIds.length + 1;
    }

    drafts.set(teamId, draft);
    registrationTeamMap.set(leadReg.id, teamId);
    for (const mid of draft.memberRegistrationIds) {
      if (registrationTeamMap.has(mid) && registrationTeamMap.get(mid) !== teamId) {
        duplicateMembers.add(mid);
        draft.issues.push("duplicate_member");
        draft.status = "needs_review";
      }
      registrationTeamMap.set(mid, teamId);
    }
  }

  if (duplicateMembers.size > 0) {
    for (const draft of drafts.values()) {
      if (draft.memberRegistrationIds.some((id) => duplicateMembers.has(id))) {
        draft.issues = uniqueIssues([...draft.issues, "duplicate_member"]);
        draft.status = "needs_review";
      }
    }
  }

  for (const reg of registrations) {
    if (manualRegIds.has(reg.id)) continue;
    const assignedTeam = registrationTeamMap.get(reg.id);
    if (assignedTeam) continue;

    const intent = reg.teamIntent!;
    const isPoolCandidate =
      intent.kind === "individual" ||
      reg.ticketCategory === "find_team" ||
      reg.inPool === true;

    if (isPoolCandidate) {
      poolRegistrationIds.add(reg.id);
      registrationTeamMap.set(reg.id, null);
    }
  }

  return {
    drafts: Array.from(drafts.values()),
    registrationTeamMap,
    poolRegistrationIds,
  };
}

export function computeFormationStats(
  teams: Team[],
  registrations: Registration[],
  poolIds: Set<string>
) {
  const formedTeams = teams.length;
  const completeTeams = teams.filter((t) => t.status === "complete").length;
  const incompleteTeams = teams.filter((t) => t.status === "incomplete").length;
  const needsReviewTeams = teams.filter((t) => t.status === "needs_review").length;
  const poolCount = poolIds.size || registrations.filter((r) => r.inPool && !r.teamId).length;
  const autoEligible = registrations.filter((r) => !r.isManualMapping).length;
  const autoResolved = registrations.filter((r) => r.teamId && !r.isManualMapping).length;
  const autoResolvedPercent =
    autoEligible > 0 ? Math.round((autoResolved / autoEligible) * 100) : 0;

  return {
    formedTeams,
    completeTeams,
    incompleteTeams,
    needsReviewTeams,
    poolCount,
    autoResolvedPercent,
  };
}
