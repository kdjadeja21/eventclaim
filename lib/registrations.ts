import { attendeeDocId } from "@/lib/import";
import { LumaGuest, LumaRegistrationAnswer } from "@/lib/luma";
import {
  Registration,
  RegistrationAnswerSnapshot,
  RegistrationRole,
  TeamAnswerQuality,
  TeamIntent,
  TeamIntentKind,
  TeamIssue,
  TicketCategory,
  TicketTypeMap,
} from "@/lib/types";
import { normalizeEmail } from "@/lib/utils";
import { z } from "zod";

export const TEAM_QUESTION_ID = "lpwm5lcq";

export const DEFAULT_TICKET_TYPE_MAP: TicketTypeMap = {
  create_team: ["ttype-txpPGyj3T3UkO4B"],
  join_team: ["ttype-u9TTcFT6YvHEm1T"],
  find_team: ["ttype-mIX0y9dKqGzeLOM"],
};

const INDIVIDUAL_PATTERN = /^individual\b/i;
const GARBAGE_PATTERNS = [
  /^no\b/i,
  /^n\/a$/i,
  /^na$/i,
  /^none$/i,
  /^core team member$/i,
  /^student$/i,
];

const FIND_TEAM_TICKET_NAME = "🎯 Find Me a Team";

export function registrationDocId(eventId: string, lumaGuestId: string, email: string): string {
  if (lumaGuestId?.trim()) return lumaGuestId.trim();
  return attendeeDocId(eventId, email);
}

export function ticketCategoryFromGuest(
  guest: LumaGuest,
  ticketTypeMap: TicketTypeMap = DEFAULT_TICKET_TYPE_MAP
): {
  ticketTypeId: string;
  ticketName: string;
  ticketCategory: TicketCategory;
} {
  const ticket = guest.event_tickets?.[0];
  const ticketTypeId = ticket?.event_ticket_type_id ?? "";
  const ticketName = ticket?.name ?? "Unknown";

  let ticketCategory: TicketCategory = "unknown";
  for (const [category, ids] of Object.entries(ticketTypeMap) as [TicketCategory, string[]][]) {
    if (ids?.includes(ticketTypeId)) {
      ticketCategory = category;
      break;
    }
  }

  if (ticketCategory === "unknown") {
    const lower = ticketName.toLowerCase();
    if (lower.includes("create")) ticketCategory = "create_team";
    else if (lower.includes("join")) ticketCategory = "join_team";
    else if (lower.includes("find")) ticketCategory = "find_team";
  }

  return { ticketTypeId, ticketName, ticketCategory };
}

export function parseTeamAnswer(raw: string, selfEmail?: string): {
  isIndividual: boolean;
  teamEmails: string[];
  teamLeadEmail: string | null;
  rawQuality: TeamAnswerQuality;
  hadSelfOnly: boolean;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      isIndividual: true,
      teamEmails: [],
      teamLeadEmail: null,
      rawQuality: "empty",
      hadSelfOnly: false,
    };
  }

  if (INDIVIDUAL_PATTERN.test(trimmed)) {
    return {
      isIndividual: true,
      teamEmails: [],
      teamLeadEmail: null,
      rawQuality: "individual_keyword",
      hadSelfOnly: false,
    };
  }

  const parts = trimmed
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const emails: string[] = [];
  let hadSelfOnly = false;
  let hadInvalidParts = false;

  for (const part of parts) {
    const candidate = normalizeEmail(part);
    if (z.string().email().safeParse(candidate).success) {
      if (selfEmail && candidate === normalizeEmail(selfEmail)) {
        hadSelfOnly = true;
        continue;
      }
      if (!emails.includes(candidate)) emails.push(candidate);
    } else {
      hadInvalidParts = true;
    }
  }

  if (emails.length === 0) {
    const quality: TeamAnswerQuality = hadSelfOnly
      ? "self_only"
      : hadInvalidParts || GARBAGE_PATTERNS.some((p) => p.test(trimmed))
        ? "garbage"
        : "empty";
    return {
      isIndividual: true,
      teamEmails: [],
      teamLeadEmail: null,
      rawQuality: quality,
      hadSelfOnly,
    };
  }

  return {
    isIndividual: false,
    teamEmails: emails,
    teamLeadEmail: emails.length === 1 ? emails[0] : null,
    rawQuality: "valid",
    hadSelfOnly,
  };
}

export function classifyTeamIntent(
  rawTicketCategory: TicketCategory,
  parsed: ReturnType<typeof parseTeamAnswer>
): TeamIntent {
  const reviewFlags: TeamIssue[] = [];
  let kind: TeamIntentKind = "individual";
  let confidence = 0.5;

  if (parsed.isIndividual) {
    if (parsed.rawQuality === "garbage") reviewFlags.push("invalid_team_answer");
    return {
      kind: "individual",
      referencedEmails: [],
      rawQuality: parsed.rawQuality,
      confidence: parsed.rawQuality === "empty" || parsed.rawQuality === "individual_keyword" ? 0.95 : 0.7,
    };
  }

  const emailCount = parsed.teamEmails.length;

  if (rawTicketCategory === "create_team" && emailCount >= 1) {
    kind = "lead";
    confidence = 0.9;
  } else if (rawTicketCategory === "join_team" && emailCount === 1) {
    kind = "member";
    confidence = 0.9;
  } else if (rawTicketCategory === "join_team" && emailCount >= 2) {
    kind = "lead";
    confidence = 0.75;
    reviewFlags.push("ticket_mismatch");
  } else if (rawTicketCategory === "find_team" && emailCount === 1) {
    kind = "member";
    confidence = 0.6;
    reviewFlags.push("ticket_mismatch");
  } else if (rawTicketCategory === "find_team" && emailCount >= 2) {
    kind = "ambiguous";
    confidence = 0.5;
  } else {
    kind = emailCount >= 2 ? "lead" : "member";
    confidence = 0.65;
  }

  const referencedEmails =
    kind === "member" && parsed.teamLeadEmail
      ? [parsed.teamLeadEmail]
      : parsed.teamEmails;

  return { kind, referencedEmails, rawQuality: parsed.rawQuality, confidence };
}

export function deriveRegistrationRole(
  ticketCategory: TicketCategory,
  intent: TeamIntent
): RegistrationRole {
  if (intent.kind === "individual" || ticketCategory === "find_team") return "individual";
  if (intent.kind === "lead") return "lead";
  if (intent.kind === "member") return "member";
  return "individual";
}

export function resolveEffectiveTicketCategory(
  rawCategory: TicketCategory,
  intent: TeamIntent
): TicketCategory {
  if (intent.kind === "individual") return "find_team";
  if (intent.kind === "lead") return "create_team";
  if (intent.kind === "member") return "join_team";
  if (rawCategory === "find_team") return "find_team";
  return rawCategory;
}

function extractAnswerText(answer: LumaRegistrationAnswer): string {
  if (typeof answer.answer === "string" && answer.answer.trim()) return answer.answer.trim();
  if (typeof answer.value === "string") return answer.value.trim();
  if (
    answer.value &&
    typeof answer.value === "object" &&
    "company" in answer.value &&
    typeof (answer.value as { company?: string }).company === "string"
  ) {
    return (answer.value as { company: string }).company.trim();
  }
  return "";
}

function buildAnswerSnapshots(
  answers: LumaGuest["registration_answers"] | undefined
): RegistrationAnswerSnapshot[] {
  if (!answers?.length) return [];
  return answers
    .map((a) => ({
      label: a.label,
      questionId: a.question_id,
      answer: extractAnswerText(a),
    }))
    .filter((a) => a.answer.length > 0);
}

export function deriveReviewFlags(intent: TeamIntent, rawCategory: TicketCategory, effectiveCategory: TicketCategory): TeamIssue[] {
  const flags: TeamIssue[] = [];
  if (intent.rawQuality === "garbage") flags.push("invalid_team_answer");
  if (
    rawCategory !== "unknown" &&
    effectiveCategory !== rawCategory &&
    rawCategory !== "find_team" &&
    intent.kind !== "individual"
  ) {
    flags.push("ticket_mismatch");
  }
  return flags;
}

export function lumaGuestToRegistration(
  guest: LumaGuest,
  eventId: string,
  existing?: Partial<Registration>,
  options?: { ticketTypeMap?: TicketTypeMap; teamQuestionId?: string }
): Registration {
  const email = normalizeEmail(guest.user_email ?? "");
  const name =
    (guest.user_name ?? "").trim() ||
    `${(guest.user_first_name ?? "").trim()} ${(guest.user_last_name ?? "").trim()}`.trim() ||
    email;

  const questionId = options?.teamQuestionId ?? TEAM_QUESTION_ID;
  const rawTicket = ticketCategoryFromGuest(guest, options?.ticketTypeMap ?? DEFAULT_TICKET_TYPE_MAP);
  const teamAnswer = guest.registration_answers?.find((a) => a.question_id === questionId);
  const teamAnswerRaw =
    typeof teamAnswer?.value === "string"
      ? teamAnswer.value
      : typeof teamAnswer?.answer === "string"
        ? teamAnswer.answer
        : "";

  const parsed = parseTeamAnswer(teamAnswerRaw, email);
  const teamIntent = classifyTeamIntent(rawTicket.ticketCategory, parsed);
  const ticketCategory = resolveEffectiveTicketCategory(rawTicket.ticketCategory, teamIntent);
  const ticketName =
    rawTicket.ticketCategory === "create_team" && ticketCategory === "find_team"
      ? FIND_TEAM_TICKET_NAME
      : rawTicket.ticketName;
  const role = deriveRegistrationRole(ticketCategory, teamIntent);
  const reviewFlags = deriveReviewFlags(teamIntent, rawTicket.ticketCategory, ticketCategory);
  const now = new Date().toISOString();
  const id = registrationDocId(eventId, guest.id, email);

  const parsedTeamEmails =
    teamIntent.kind === "lead" ? teamIntent.referencedEmails : parsed.teamEmails;
  const parsedTeamLeadEmail =
    teamIntent.kind === "member" ? teamIntent.referencedEmails[0] ?? null : null;

  const inPool = teamIntent.kind === "individual" || ticketCategory === "find_team";

  return {
    id,
    eventId,
    lumaGuestId: guest.id,
    email,
    name,
    phone: guest.phone_number ?? null,
    ticketTypeId: rawTicket.ticketTypeId,
    ticketName,
    ticketCategory,
    rawTicketCategory: rawTicket.ticketCategory,
    teamAnswerRaw,
    parsedTeamEmails,
    parsedTeamLeadEmail,
    teamIntent,
    reviewFlags,
    role,
    teamId: existing?.teamId ?? null,
    inPool: existing?.isManualMapping ? existing.inPool ?? false : inPool,
    registrationAnswers: buildAnswerSnapshots(guest.registration_answers),
    registeredAt: guest.registered_at ?? null,
    approvalStatus: guest.approval_status,
    checkedInAt: guest.checked_in_at ?? null,
    attendeeId: existing?.attendeeId ?? null,
    isManualMapping: existing?.isManualMapping ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSyncedAt: now,
  };
}

/** Backfill missing v2 fields on registrations loaded from Firestore. */
export function hydrateRegistration(reg: Registration): Registration {
  if (reg.teamIntent && reg.rawTicketCategory) return reg;

  const parsed = parseTeamAnswer(reg.teamAnswerRaw, reg.email);
  const rawCategory = reg.rawTicketCategory ?? reg.ticketCategory;
  const teamIntent =
    reg.teamIntent ?? classifyTeamIntent(rawCategory, parsed);
  const ticketCategory =
    reg.ticketCategory ?? resolveEffectiveTicketCategory(rawCategory, teamIntent);

  return {
    ...reg,
    rawTicketCategory: rawCategory,
    teamIntent,
    reviewFlags: reg.reviewFlags ?? deriveReviewFlags(teamIntent, rawCategory, ticketCategory),
    inPool: reg.inPool ?? (teamIntent.kind === "individual" || ticketCategory === "find_team"),
    role: reg.role ?? deriveRegistrationRole(ticketCategory, teamIntent),
  };
}

export function getRegistrationField(reg: Registration, questionId: string): string | null {
  const match = reg.registrationAnswers.find((a) => a.questionId === questionId);
  return match?.answer ?? null;
}

export const PRIMARY_ROLE_QUESTION_ID = "vqdmckn6";
export const COMPANY_QUESTION_ID = "iiwj9n1z";
export const LINKEDIN_QUESTION_ID = "09j52uy4";

export const ISSUE_LABELS: Record<TeamIssue, string> = {
  missing_member: "Expected member not registered",
  unmatched_lead: "Team lead email not found",
  invalid_team_answer: "Invalid or unclear team answer",
  no_lead: "Could not determine team lead",
  duplicate_member: "Member linked to multiple teams",
  size_under: "Team below minimum size",
  size_over: "Team exceeds maximum size",
  fuzzy_match_pending: "Possible email typo — review suggested match",
  ticket_mismatch: "Ticket type does not match team answer",
};

export const ISSUE_PRIORITY: Record<TeamIssue, number> = {
  duplicate_member: 1,
  fuzzy_match_pending: 2,
  no_lead: 3,
  unmatched_lead: 4,
  missing_member: 5,
  size_under: 6,
  size_over: 7,
  invalid_team_answer: 8,
  ticket_mismatch: 9,
};
