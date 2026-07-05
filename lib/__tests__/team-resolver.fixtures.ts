import {
  classifyTeamIntent,
  deriveReviewFlags,
  parseTeamAnswer,
  resolveEffectiveTicketCategory,
} from "@/lib/registrations";
import {
  Registration,
  TeamIntent,
  TicketCategory,
} from "@/lib/types";

const NOW = "2026-01-01T00:00:00.000Z";

function intentFrom(
  rawCategory: TicketCategory,
  teamAnswerRaw: string,
  email: string
): TeamIntent {
  const parsed = parseTeamAnswer(teamAnswerRaw, email);
  return classifyTeamIntent(rawCategory, parsed);
}

export function makeRegistration(input: {
  id: string;
  email: string;
  name: string;
  rawTicketCategory: TicketCategory;
  teamAnswerRaw: string;
  overrides?: Partial<Registration>;
}): Registration {
  const email = input.email.toLowerCase();
  const teamIntent = intentFrom(input.rawTicketCategory, input.teamAnswerRaw, email);
  const ticketCategory = resolveEffectiveTicketCategory(
    input.rawTicketCategory,
    teamIntent
  );

  return {
    id: input.id,
    eventId: "evt-test",
    lumaGuestId: input.id,
    email,
    name: input.name,
    ticketTypeId: "ttype-test",
    ticketName: input.rawTicketCategory,
    ticketCategory,
    rawTicketCategory: input.rawTicketCategory,
    teamAnswerRaw: input.teamAnswerRaw,
    parsedTeamEmails:
      teamIntent.kind === "lead"
        ? teamIntent.referencedEmails
        : parseTeamAnswer(input.teamAnswerRaw, email).teamEmails,
    parsedTeamLeadEmail:
      teamIntent.kind === "member" ? teamIntent.referencedEmails[0] ?? null : null,
    teamIntent,
    reviewFlags: deriveReviewFlags(teamIntent, input.rawTicketCategory, ticketCategory),
    role:
      teamIntent.kind === "lead"
        ? "lead"
        : teamIntent.kind === "member"
          ? "member"
          : "individual",
    teamId: null,
    inPool: teamIntent.kind === "individual" || ticketCategory === "find_team",
    registrationAnswers: [],
    registeredAt: NOW,
    approvalStatus: "approved",
    checkedInAt: null,
    attendeeId: null,
    isManualMapping: false,
    createdAt: NOW,
    updatedAt: NOW,
    lastSyncedAt: NOW,
    ...input.overrides,
  };
}

/** Create lead + 3 registered members — complete team of 4 */
export function shivanshCreateTeam(): Registration[] {
  return [
    makeRegistration({
      id: "lead-shivansh",
      email: "shivansh@example.com",
      name: "Shivansh",
      rawTicketCategory: "create_team",
      teamAnswerRaw:
        "a@example.com,b@example.com,c@example.com",
    }),
    makeRegistration({
      id: "mem-a",
      email: "a@example.com",
      name: "Member A",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "shivansh@example.com",
    }),
    makeRegistration({
      id: "mem-b",
      email: "b@example.com",
      name: "Member B",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "shivansh@example.com",
    }),
    makeRegistration({
      id: "mem-c",
      email: "c@example.com",
      name: "Member C",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "shivansh@example.com",
    }),
  ];
}

/** Lead lists typo email — fuzzy suggestion expected */
export function harshTeamWithTypo(): Registration[] {
  return [
    makeRegistration({
      id: "lead-harsh",
      email: "harsh@example.com",
      name: "Harsh",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "puroonjaybhavsar8626@gmail.com",
    }),
    makeRegistration({
      id: "mem-puroonjay",
      email: "puroonjaybhavsar8623@gmail.com",
      name: "Puroonjay",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "harsh@example.com",
    }),
  ];
}

/** Create + 3 join members (SVIT cluster style) */
export function dhruvSVITCluster(): Registration[] {
  return [
    makeRegistration({
      id: "lead-dhruv",
      email: "dhruv@example.com",
      name: "Dhruv",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "m1@example.com,m2@example.com,m3@example.com",
    }),
    makeRegistration({
      id: "svit-m1",
      email: "m1@example.com",
      name: "SVIT M1",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "dhruv@example.com",
    }),
    makeRegistration({
      id: "svit-m2",
      email: "m2@example.com",
      name: "SVIT M2",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "dhruv@example.com",
    }),
    makeRegistration({
      id: "svit-m3",
      email: "m3@example.com",
      name: "SVIT M3",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "dhruv@example.com",
    }),
  ];
}

export function siddhantSelfEmail(): Registration[] {
  return [
    makeRegistration({
      id: "self-siddhant",
      email: "siddhant@example.com",
      name: "Siddhant",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "siddhant@example.com",
    }),
  ];
}

export function hemalSelfReference(): Registration[] {
  return [
    makeRegistration({
      id: "self-hemal",
      email: "hemal@example.com",
      name: "Hemal",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "hemal@example.com, other@example.com",
    }),
  ];
}

export function garbageAnswer(): Registration[] {
  return [
    makeRegistration({
      id: "garbage-user",
      email: "student@example.com",
      name: "Student",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "No I am student",
    }),
  ];
}

export function individualKeyword(): Registration[] {
  return [
    makeRegistration({
      id: "ind-user",
      email: "solo@example.com",
      name: "Solo",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "Individual",
    }),
  ];
}

export function joinWrongTicketLeadShape(): Registration[] {
  return [
    makeRegistration({
      id: "wrong-ticket-lead",
      email: "wrong@example.com",
      name: "Wrong Ticket Lead",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "a@example.com,b@example.com,c@example.com",
    }),
    makeRegistration({
      id: "wt-a",
      email: "a@example.com",
      name: "WT A",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "wrong@example.com",
    }),
  ];
}

export function duplicateMemberConflict(): Registration[] {
  return [
    makeRegistration({
      id: "lead-1",
      email: "lead1@example.com",
      name: "Lead One",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "shared@example.com",
    }),
    makeRegistration({
      id: "lead-2",
      email: "lead2@example.com",
      name: "Lead Two",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "shared@example.com",
    }),
    makeRegistration({
      id: "shared-mem",
      email: "shared@example.com",
      name: "Shared Member",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "lead1@example.com",
    }),
  ];
}

export function membersBeforeLead(): Registration[] {
  return [
    makeRegistration({
      id: "early-m1",
      email: "early1@example.com",
      name: "Early M1",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "late-lead@example.com",
    }),
    makeRegistration({
      id: "early-m2",
      email: "early2@example.com",
      name: "Early M2",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "late-lead@example.com",
    }),
    makeRegistration({
      id: "late-lead",
      email: "late-lead@example.com",
      name: "Late Lead",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "early1@example.com,early2@example.com",
    }),
  ];
}

export function unmatchedJoinMember(): Registration[] {
  return [
    makeRegistration({
      id: "orphan-join",
      email: "orphan@example.com",
      name: "Orphan Join",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "missing-lead@example.com",
    }),
  ];
}

export function findPoolRegistrants(count: number): Registration[] {
  return Array.from({ length: count }, (_, i) =>
    makeRegistration({
      id: `find-${i}`,
      email: `find${i}@example.com`,
      name: `Find User ${i}`,
      rawTicketCategory: "find_team",
      teamAnswerRaw: "",
    })
  );
}

export function missingMemberPartial(): Registration[] {
  return [
    makeRegistration({
      id: "partial-lead",
      email: "partial@example.com",
      name: "Partial Lead",
      rawTicketCategory: "create_team",
      teamAnswerRaw: "got@example.com,missing@example.com,also-missing@example.com",
    }),
    makeRegistration({
      id: "partial-got",
      email: "got@example.com",
      name: "Got Member",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "partial@example.com",
    }),
  ];
}

export function findLeadReferencedByMembers(): Registration[] {
  return [
    makeRegistration({
      id: "find-as-lead",
      email: "findlead@example.com",
      name: "Find Lead",
      rawTicketCategory: "find_team",
      teamAnswerRaw: "",
    }),
    makeRegistration({
      id: "ref-m1",
      email: "ref1@example.com",
      name: "Ref M1",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "findlead@example.com",
    }),
    makeRegistration({
      id: "ref-m2",
      email: "ref2@example.com",
      name: "Ref M2",
      rawTicketCategory: "join_team",
      teamAnswerRaw: "findlead@example.com",
    }),
  ];
}
