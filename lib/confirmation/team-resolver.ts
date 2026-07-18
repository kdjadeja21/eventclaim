import { recoverTeamIntentFromAttendee } from "@/lib/confirmation/csv";
import { findSuggestions } from "@/lib/confirmation/email-match";
import {
  ConfirmationAttendee,
  ConfirmationSuggestedLink,
  ConfirmationTeam,
  ConfirmationTeamFormationStats,
  ConfirmationTeamIssue,
  ConfirmationTeamRules,
  ConfirmationTeamStatus,
} from "@/lib/confirmation/types";
import { normalizeEmail } from "@/lib/utils";

function nowIso(): string {
  return new Date().toISOString();
}

// ─── Team Resolver ──────────────────────────────────────────────────────────────
// Groups attendees into teams by building a graph of who-references-whom (from
// the CSV's team-lead/teammate column) and finding connected components via
// union-find, then picks a lead per component, computes review issues, and
// suggests fuzzy-match fixes for unmatched/mistyped emails. Runs across ALL
// current attendees (not just one upload batch), so teams merge correctly even
// if the lead and teammates were uploaded in separate CSVs.

interface TeamEdge {
  fromId: string;
  toEmail: string;
  toId?: string;
  type: "expects_member" | "expects_lead";
  bidirectional: boolean;
}

interface ComponentDraft {
  attendeeIds: Set<string>;
  phantomEmails: Set<string>; // referenced emails with no matching attendee
  edges: TeamEdge[];
}

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const p = this.parent.get(id);
    if (!p || p === id) {
      this.parent.set(id, id);
      return id;
    }
    const root = this.find(p);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function buildEmailIndex(attendees: ConfirmationAttendee[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of attendees) map.set(normalizeEmail(a.email), a.id);
  return map;
}

function referencedEmailsOf(attendee: ConfirmationAttendee): string[] {
  return (attendee.teamIntent?.referencedEmails ?? []).map(normalizeEmail).filter(Boolean);
}

function edgeTypeForKind(
  kind: NonNullable<ConfirmationAttendee["teamIntent"]>["kind"],
  referencedCount: number
): "expects_member" | "expects_lead" | null {
  if (kind === "lead") return "expects_member";
  if (kind === "member") return "expects_lead";
  if (kind === "ambiguous") {
    // Multiple emails ⇒ forming a team; a single email ⇒ joining / naming a lead.
    return referencedCount >= 2 ? "expects_member" : "expects_lead";
  }
  // Individuals with leftover emails (misclassified ticket) still contribute
  // edges so teams can form from the email graph alone.
  if (referencedCount >= 2) return "expects_member";
  if (referencedCount === 1) return "expects_lead";
  return null;
}

function buildEdges(
  attendees: ConfirmationAttendee[],
  emailToId: Map<string, string>
): TeamEdge[] {
  const edges: TeamEdge[] = [];

  for (const attendee of attendees) {
    const kind = attendee.teamIntent?.kind ?? "individual";
    const selfEmail = normalizeEmail(attendee.email);
    const referenced = referencedEmailsOf(attendee);
    const edgeType = edgeTypeForKind(kind, referenced.length);
    if (!edgeType) continue;

    for (const email of referenced) {
      if (email === selfEmail) continue;
      const toId = emailToId.get(email);
      const reverse = attendees.find(
        (other) =>
          normalizeEmail(other.email) === email &&
          referencedEmailsOf(other).includes(selfEmail)
      );
      edges.push({
        fromId: attendee.id,
        toEmail: email,
        toId,
        type: edgeType,
        bidirectional: !!reverse,
      });
    }
  }

  return edges;
}

function buildComponents(
  attendees: ConfirmationAttendee[],
  edges: TeamEdge[]
): Map<string, ComponentDraft> {
  const uf = new UnionFind();
  for (const a of attendees) uf.add(a.id);

  for (const edge of edges) {
    uf.add(edge.fromId);
    if (edge.toId) uf.union(edge.fromId, edge.toId);
  }

  const components = new Map<string, ComponentDraft>();

  for (const attendee of attendees) {
    const root = uf.find(attendee.id);
    if (!components.has(root)) {
      components.set(root, { attendeeIds: new Set(), phantomEmails: new Set(), edges: [] });
    }
    components.get(root)!.attendeeIds.add(attendee.id);
  }

  for (const edge of edges) {
    const root = uf.find(edge.fromId);
    const comp = components.get(root);
    if (!comp) continue;
    comp.edges.push(edge);
    if (!edge.toId) comp.phantomEmails.add(edge.toEmail);
  }

  return components;
}

function countInboundLeadEdges(attendeeId: string, edges: TeamEdge[]): number {
  return edges.filter((e) => e.toId === attendeeId && e.type === "expects_lead").length;
}

function scoreLeadCandidate(attendee: ConfirmationAttendee, edges: TeamEdge[]): number {
  let score = 0;
  const kind = attendee.teamIntent?.kind;
  if (kind === "lead") score += 3;
  if (kind === "ambiguous" && (attendee.teamIntent?.referencedEmails?.length ?? 0) >= 2) {
    score += 2;
  }
  score += countInboundLeadEdges(attendee.id, edges);
  // Being listed by others as a member is a mild lead signal.
  score += edges.filter((e) => e.toId === attendee.id && e.type === "expects_member").length;
  if (
    kind === "member" &&
    !edges.some((e) => e.fromId === attendee.id && e.type === "expects_member")
  ) {
    score -= 2;
  }
  return score;
}

function pickLead(
  memberIds: string[],
  attendeeMap: Map<string, ConfirmationAttendee>,
  edges: TeamEdge[]
): { leadId: string | null; tied: boolean } {
  const scores = memberIds.map((id) => ({
    id,
    score: scoreLeadCandidate(attendeeMap.get(id)!, edges),
    kind: attendeeMap.get(id)!.teamIntent?.kind ?? "individual",
  }));
  scores.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  if (scores.length === 0) return { leadId: null, tied: false };
  if (scores.length === 1) return { leadId: scores[0].id, tied: false };

  const explicitLeads = scores.filter((s) => s.kind === "lead");
  if (explicitLeads.length > 1 && explicitLeads[0].score === explicitLeads[1].score) {
    return { leadId: null, tied: true };
  }
  if (explicitLeads.length === 1) {
    return { leadId: explicitLeads[0].id, tied: false };
  }

  // For mutually-linked teammates without an explicit lead ticket, still pick
  // a stable lead so the team card forms instead of collapsing to "no lead".
  if (memberIds.length >= 2) {
    return { leadId: scores[0].id, tied: false };
  }

  if (scores[0].score <= 0) return { leadId: null, tied: true };
  return { leadId: scores[0].id, tied: false };
}

function computeTeamStatus(
  issues: ConfirmationTeamIssue[],
  sizeActual: number,
  rules: ConfirmationTeamRules
): ConfirmationTeamStatus {
  if (
    issues.includes("duplicate_member") ||
    issues.includes("no_lead") ||
    issues.includes("fuzzy_match_pending") ||
    issues.includes("unmatched_lead")
  ) {
    return "needs_review";
  }
  if (issues.includes("missing_member") || issues.includes("size_under")) {
    return "incomplete";
  }
  if (issues.includes("size_over") && !rules.allowOversized) {
    return "incomplete";
  }
  if (sizeActual >= rules.minSize && sizeActual <= rules.maxSize) {
    return "complete";
  }
  return "incomplete";
}

function buildReviewSummary(issues: ConfirmationTeamIssue[], leadEmail: string | null): string {
  if (issues.includes("unmatched_lead")) return "Team lead email not found";
  if (issues.includes("duplicate_member")) return "Member appears in multiple teams";
  if (issues.includes("no_lead")) return "Could not determine team lead";
  if (issues.includes("fuzzy_match_pending")) return "Possible email typo — review suggested match";
  if (issues.includes("missing_member")) return "One or more expected members not registered";
  if (issues.includes("size_under")) return "Team below minimum size";
  if (issues.includes("size_over")) return "Team exceeds maximum size";
  if (leadEmail) return "";
  return "Team needs review";
}

function dedupeSuggestions(links: ConfirmationSuggestedLink[]): ConfirmationSuggestedLink[] {
  const seen = new Set<string>();
  const result: ConfirmationSuggestedLink[] = [];
  for (const link of [...links].sort((a, b) => b.score - a.score)) {
    const key = `${link.fromEmail}:${link.toAttendeeId}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(link);
    }
  }
  return result.slice(0, 5);
}

function isPoolQuality(attendee: ConfirmationAttendee): boolean {
  const intent = attendee.teamIntent;
  if (!intent) return true;

  // Listed teammate/lead emails → keep out of the individual pool.
  if ((intent.referencedEmails?.length ?? 0) > 0) return false;

  // A declared lead with a blank email field still gets an incomplete team
  // card for admin review. Lone members/individuals with no emails stay in pool.
  if (intent.kind === "lead") return false;

  return true;
}

function validateComponent(
  comp: ComponentDraft,
  attendees: ConfirmationAttendee[],
  emailToId: Map<string, string>,
  rules: ConfirmationTeamRules,
  duplicateMembers: Set<string>
): { team: ConfirmationTeam | null; poolIds: string[] } {
  const attendeeMap = new Map(attendees.map((a) => [a.id, a]));
  const memberIds = [...comp.attendeeIds];
  const poolIds: string[] = [];

  if (memberIds.length === 0) return { team: null, poolIds };

  if (memberIds.length === 1 && isPoolQuality(attendeeMap.get(memberIds[0])!)) {
    poolIds.push(memberIds[0]);
    return { team: null, poolIds };
  }

  const issues: ConfirmationTeamIssue[] = [];
  const suggestedLinks: ConfirmationSuggestedLink[] = [];

  const leadCandidates = memberIds.filter(
    (id) => scoreLeadCandidate(attendeeMap.get(id)!, comp.edges) >= 3
  );
  if (leadCandidates.length > 1) issues.push("duplicate_member");

  const { leadId, tied } = pickLead(memberIds, attendeeMap, comp.edges);
  if (tied || !leadId) issues.push("no_lead");

  for (const id of memberIds) {
    if (duplicateMembers.has(id)) issues.push("duplicate_member");
  }

  const lead = leadId ? attendeeMap.get(leadId)! : null;
  const leadEmail = lead ? normalizeEmail(lead.email) : null;

  const expectedMemberEmails: string[] = [];
  if (lead && lead.teamIntent?.kind === "lead") {
    for (const e of referencedEmailsOf(lead)) {
      if (e !== leadEmail) expectedMemberEmails.push(e);
    }
  }

  const registeredEmails = new Set(memberIds.map((id) => normalizeEmail(attendeeMap.get(id)!.email)));

  for (const expected of expectedMemberEmails) {
    if (!registeredEmails.has(expected)) {
      issues.push("missing_member");
      const suggestions = findSuggestions(expected, attendees);
      if (suggestions.length > 0) {
        issues.push("fuzzy_match_pending");
        suggestedLinks.push(...suggestions);
      }
    }
  }

  for (const phantom of comp.phantomEmails) {
    if (phantom === leadEmail) continue;
    const toId = emailToId.get(phantom);
    if (!toId && comp.edges.some((e) => e.toEmail === phantom && e.type === "expects_lead")) {
      if (!issues.includes("unmatched_lead")) issues.push("unmatched_lead");
      const suggestions = findSuggestions(phantom, attendees);
      if (suggestions.length > 0) {
        if (!issues.includes("fuzzy_match_pending")) issues.push("fuzzy_match_pending");
        suggestedLinks.push(...suggestions);
      }
    }
  }

  const memberAttendeeIds = memberIds.filter((id) => id !== leadId);
  const sizeActual = memberIds.length;
  const sizeExpected = Math.max(rules.minSize, expectedMemberEmails.length + (leadId ? 1 : 0));

  if (sizeActual < rules.minSize) issues.push("size_under");
  if (sizeActual > rules.maxSize && !rules.allowOversized) issues.push("size_over");

  const uniqueIssues = [...new Set(issues)];
  const status = computeTeamStatus(uniqueIssues, sizeActual, rules);
  const confidence = lead
    ? Math.min(
        0.95,
        0.5 + (lead.teamIntent?.kind === "lead" ? 0.4 : 0.2) + (uniqueIssues.length === 0 ? 0.1 : 0)
      )
    : 0.4;

  const team: ConfirmationTeam = {
    id: leadId ? `team-${leadId}` : `team-review-${memberIds[0]}`,
    leadAttendeeId: leadId,
    leadEmail: leadEmail ?? comp.edges.find((e) => e.type === "expects_lead")?.toEmail ?? null,
    leadName: lead?.name ?? null,
    memberAttendeeIds: memberAttendeeIds,
    expectedMemberEmails,
    status,
    issues: uniqueIssues,
    confidence,
    suggestedLinks: dedupeSuggestions(suggestedLinks),
    sizeExpected,
    sizeActual,
    reviewSummary: buildReviewSummary(uniqueIssues, leadEmail),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  return { team, poolIds };
}

function findDuplicateMembers(components: Map<string, ComponentDraft>): Set<string> {
  const claimedBy = new Map<string, Set<string>>();
  for (const [root, comp] of components) {
    for (const edge of comp.edges) {
      if (edge.type !== "expects_member") continue;
      const targetKey = edge.toId ?? normalizeEmail(edge.toEmail);
      if (!targetKey) continue;
      const set = claimedBy.get(targetKey) ?? new Set<string>();
      set.add(root);
      claimedBy.set(targetKey, set);
    }
  }

  const duplicates = new Set<string>();
  for (const [target, roots] of claimedBy) {
    if (roots.size > 1) duplicates.add(target);
  }
  return duplicates;
}

export interface TeamResolverOutput {
  teams: ConfirmationTeam[];
  poolAttendeeIds: string[];
  assignments: Map<string, string>; // attendeeId -> teamId
}

export function resolveConfirmationTeams(
  attendees: ConfirmationAttendee[],
  rules: ConfirmationTeamRules
): TeamResolverOutput {
  // Recover emails from `extra` / re-classify kind so improved detection
  // rules take effect on Resolve without requiring a fresh CSV upload.
  const refinedAttendees = attendees.map((a) => {
    const recovered = recoverTeamIntentFromAttendee(a);
    const unchanged =
      a.teamIntent &&
      a.teamIntent.kind === recovered.kind &&
      a.teamIntent.quality === recovered.quality &&
      JSON.stringify(a.teamIntent.referencedEmails ?? []) ===
        JSON.stringify(recovered.referencedEmails ?? []) &&
      (a.teamIntent.rawValue ?? null) === (recovered.rawValue ?? null);
    if (unchanged) return a;
    return { ...a, teamIntent: recovered };
  });

  const emailToId = buildEmailIndex(refinedAttendees);
  const edges = buildEdges(refinedAttendees, emailToId);
  const components = buildComponents(refinedAttendees, edges);
  const duplicateMembers = findDuplicateMembers(components);

  const teams: ConfirmationTeam[] = [];
  const poolAttendeeIds: string[] = [];
  const assignments = new Map<string, string>();

  for (const attendee of refinedAttendees) {
    if (isPoolQuality(attendee) && !poolAttendeeIds.includes(attendee.id)) {
      poolAttendeeIds.push(attendee.id);
    }
  }

  for (const comp of components.values()) {
    const { team, poolIds } = validateComponent(
      comp,
      refinedAttendees,
      emailToId,
      rules,
      duplicateMembers
    );
    for (const id of poolIds) {
      if (!poolAttendeeIds.includes(id)) poolAttendeeIds.push(id);
    }
    if (team) {
      teams.push(team);
      const allMembers = [
        ...(team.leadAttendeeId ? [team.leadAttendeeId] : []),
        ...team.memberAttendeeIds,
      ];
      for (const id of allMembers) {
        assignments.set(id, team.id);
        const idx = poolAttendeeIds.indexOf(id);
        if (idx >= 0) poolAttendeeIds.splice(idx, 1);
      }
    }
  }

  return { teams, poolAttendeeIds, assignments };
}

/** Per-attendee teamKey/teamRole/inPool fields to persist after a resolve pass. */
export function computeAttendeeTeamFields(
  attendee: ConfirmationAttendee,
  output: TeamResolverOutput
): { teamKey: string | null; teamRole: ConfirmationAttendee["teamRole"]; inPool: boolean } {
  const teamId = output.assignments.get(attendee.id) ?? null;
  const inPool = output.poolAttendeeIds.includes(attendee.id);

  let teamRole: ConfirmationAttendee["teamRole"] = "individual";
  if (teamId) {
    const team = output.teams.find((t) => t.id === teamId);
    teamRole = team?.leadAttendeeId === attendee.id ? "lead" : "member";
  } else if (!inPool) {
    teamRole = attendee.teamIntent?.kind === "lead" ? "lead" : "individual";
  }

  return { teamKey: teamId, teamRole, inPool };
}

export function computeTeamFormationStats(
  teams: ConfirmationTeam[],
  attendees: ConfirmationAttendee[]
): ConfirmationTeamFormationStats {
  const poolCount = attendees.filter((a) => a.inPool).length;
  const completeTeams = teams.filter((t) => t.status === "complete").length;
  const incompleteTeams = teams.filter((t) => t.status === "incomplete").length;
  const needsReviewTeams = teams.filter((t) => t.status === "needs_review").length;
  const total = attendees.length;
  const onTeam = attendees.filter((a) => a.teamKey && !a.inPool).length;
  const autoResolvedPercent = total > 0 ? Math.round((onTeam / total) * 100) : 0;

  return {
    formedTeams: teams.length,
    completeTeams,
    incompleteTeams,
    needsReviewTeams,
    poolCount,
    totalAttendees: total,
    autoResolvedPercent,
    updatedAt: nowIso(),
  };
}
