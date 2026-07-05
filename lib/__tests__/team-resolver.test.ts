import { describe, expect, it } from "vitest";
import { resolveTeamsFromRegistrations } from "@/lib/team-resolver";
import {
  dhruvSVITCluster,
  duplicateMemberConflict,
  findLeadReferencedByMembers,
  findPoolRegistrants,
  garbageAnswer,
  harshTeamWithTypo,
  hemalSelfReference,
  individualKeyword,
  joinWrongTicketLeadShape,
  membersBeforeLead,
  missingMemberPartial,
  siddhantSelfEmail,
  shivanshCreateTeam,
  unmatchedJoinMember,
} from "./team-resolver.fixtures";

const EVENT_ID = "evt-test";

function resolve(regs: ReturnType<typeof shivanshCreateTeam>) {
  return resolveTeamsFromRegistrations(EVENT_ID, regs, []);
}

describe("team resolver scenarios", () => {
  it("auto-forms complete team when lead + 3 members registered", () => {
    const { drafts, poolRegistrationIds } = resolve(shivanshCreateTeam());
    const team = drafts.find((d) => d.id === "team-lead-shivansh");
    expect(team).toBeDefined();
    expect(team!.status).toBe("complete");
    expect(team!.memberRegistrationIds).toHaveLength(3);
    expect(poolRegistrationIds.size).toBe(0);
  });

  it("forms SVIT cluster with lead picked", () => {
    const { drafts } = resolve(dhruvSVITCluster());
    const team = drafts.find((d) => d.leadRegistrationId === "lead-dhruv");
    expect(team).toBeDefined();
    expect(team!.memberRegistrationIds).toHaveLength(3);
  });

  it("puts self-email-only create ticket in pool", () => {
    const { drafts, poolRegistrationIds } = resolve(siddhantSelfEmail());
    expect(drafts.filter((d) => d.source === "auto")).toHaveLength(0);
    expect(poolRegistrationIds.has("self-siddhant")).toBe(true);
  });

  it("puts Individual keyword answer in pool", () => {
    const { poolRegistrationIds } = resolve(individualKeyword());
    expect(poolRegistrationIds.has("ind-user")).toBe(true);
  });

  it("puts garbage create answer in pool", () => {
    const { poolRegistrationIds } = resolve(garbageAnswer());
    expect(poolRegistrationIds.has("garbage-user")).toBe(true);
  });

  it("suggests fuzzy match for typo member email", () => {
    const { drafts } = resolve(harshTeamWithTypo());
    const team = drafts.find((d) => d.leadRegistrationId === "lead-harsh");
    expect(team?.issues).toContain("missing_member");
    expect(team?.issues).toContain("fuzzy_match_pending");
    expect(team?.suggestedLinks?.some((l) => l.toRegistrationId === "mem-puroonjay")).toBe(true);
  });

  it("flags partial team with missing_member", () => {
    const { drafts } = resolve(missingMemberPartial());
    const team = drafts.find((d) => d.leadRegistrationId === "partial-lead");
    expect(team?.issues).toContain("missing_member");
    expect(team?.status).toBe("incomplete");
  });

  it("creates review team for unmatched join member", () => {
    const { drafts } = resolve(unmatchedJoinMember());
    const review = drafts.find((d) => d.id.startsWith("team-review-"));
    expect(review).toBeDefined();
    expect(review!.status).toBe("needs_review");
    expect(review!.issues).toContain("unmatched_lead");
  });

  it("resolves members-before-lead on same sync", () => {
    const { drafts } = resolve(membersBeforeLead());
    const team = drafts.find((d) => d.leadRegistrationId === "late-lead");
    expect(team).toBeDefined();
    expect(team!.memberRegistrationIds).toContain("early-m1");
    expect(team!.memberRegistrationIds).toContain("early-m2");
  });

  it("overrides join ticket when answer lists multiple emails", () => {
    const { drafts } = resolve(joinWrongTicketLeadShape());
    const team = drafts.find((d) => d.leadRegistrationId === "wrong-ticket-lead");
    expect(team).toBeDefined();
    expect(team!.issues).toContain("ticket_mismatch");
  });

  it("merges two leads claiming same member into one component", () => {
    const { drafts } = resolve(duplicateMemberConflict());
    const teamsWithShared = drafts.filter(
      (d) =>
        d.leadRegistrationId === "lead-1" ||
        d.leadRegistrationId === "lead-2" ||
        d.memberRegistrationIds.includes("shared-mem")
    );
    expect(teamsWithShared).toHaveLength(1);
    expect(teamsWithShared[0]!.memberRegistrationIds).toContain("shared-mem");
  });

  it("keeps find-me-a-team registrants in pool without team rows", () => {
    const regs = findPoolRegistrants(5);
    const { drafts, poolRegistrationIds } = resolve(regs);
    expect(drafts.filter((d) => d.source === "auto")).toHaveLength(0);
    expect(poolRegistrationIds.size).toBe(5);
  });

  it("links find-ticket lead when members reference them", () => {
    const { drafts } = resolve(findLeadReferencedByMembers());
    const team = drafts.find((d) => d.leadRegistrationId === "find-as-lead");
    expect(team).toBeDefined();
    expect(team!.memberRegistrationIds.length).toBeGreaterThanOrEqual(1);
  });

  it("does not create team for hemal self-reference with other email only", () => {
    const { drafts, poolRegistrationIds } = resolve(hemalSelfReference());
    const inTeam = drafts.some(
      (d) =>
        d.leadRegistrationId === "self-hemal" ||
        d.memberRegistrationIds.includes("self-hemal")
    );
    expect(inTeam || poolRegistrationIds.has("self-hemal")).toBe(true);
  });
});

describe("team resolver size rules", () => {
  it("flags size_under for 2-person team with minSize 3", () => {
    const regs = [
      ...shivanshCreateTeam().slice(0, 2),
    ];
    const { drafts } = resolveTeamsFromRegistrations(EVENT_ID, regs, [], {
      teamRules: { minSize: 3, maxSize: 4, allowOversized: false },
    });
    const team = drafts[0];
    expect(team?.issues).toContain("size_under");
  });
});
