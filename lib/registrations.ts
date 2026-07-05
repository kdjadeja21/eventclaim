import { attendeeDocId } from "@/lib/import";
import { LumaGuest, LumaRegistrationAnswer } from "@/lib/luma";
import {
  Registration,
  RegistrationAnswerSnapshot,
  RegistrationRole,
  TicketCategory,
} from "@/lib/types";
import { normalizeEmail } from "@/lib/utils";
import { z } from "zod";

export const TEAM_QUESTION_ID = "lpwm5lcq";

export const TICKET_TYPE_MAP: Record<string, TicketCategory> = {
  "ttype-txpPGyj3T3UkO4B": "create_team",
  "ttype-u9TTcFT6YvHEm1T": "join_team",
  "ttype-mIX0y9dKqGzeLOM": "find_team",
};

const INDIVIDUAL_PATTERN = /^individual\b/i;

export function registrationDocId(eventId: string, lumaGuestId: string, email: string): string {
  if (lumaGuestId?.trim()) return lumaGuestId.trim();
  return attendeeDocId(eventId, email);
}

export function ticketCategoryFromGuest(guest: LumaGuest): {
  ticketTypeId: string;
  ticketName: string;
  ticketCategory: TicketCategory;
} {
  const ticket = guest.event_tickets?.[0];
  const ticketTypeId = ticket?.event_ticket_type_id ?? "";
  const ticketName = ticket?.name ?? "Unknown";

  let ticketCategory = TICKET_TYPE_MAP[ticketTypeId] ?? "unknown";
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
} {
  const trimmed = raw.trim();
  if (!trimmed || INDIVIDUAL_PATTERN.test(trimmed)) {
    return { isIndividual: true, teamEmails: [], teamLeadEmail: null };
  }

  const parts = trimmed
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const emails: string[] = [];
  for (const part of parts) {
    const candidate = normalizeEmail(part);
    if (z.string().email().safeParse(candidate).success) {
      if (selfEmail && candidate === normalizeEmail(selfEmail)) continue;
      if (!emails.includes(candidate)) emails.push(candidate);
    }
  }

  if (emails.length === 0) {
    return { isIndividual: true, teamEmails: [], teamLeadEmail: null };
  }

  return {
    isIndividual: false,
    teamEmails: emails,
    teamLeadEmail: emails.length === 1 ? emails[0] : null,
  };
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

export function deriveRegistrationRole(
  ticketCategory: TicketCategory,
  parsed: ReturnType<typeof parseTeamAnswer>
): RegistrationRole {
  if (ticketCategory === "find_team" || parsed.isIndividual) return "individual";
  if (ticketCategory === "create_team") return "lead";
  if (ticketCategory === "join_team") return "member";
  return "individual";
}

/** Create-a-Team with no member emails (or only own email) → Find Me a Team. */
export function resolveEffectiveTicketCategory(
  rawCategory: TicketCategory,
  parsed: ReturnType<typeof parseTeamAnswer>
): TicketCategory {
  if (rawCategory === "create_team" && parsed.isIndividual) {
    return "find_team";
  }
  return rawCategory;
}

const FIND_TEAM_TICKET_NAME = "🎯 Find Me a Team";

export function lumaGuestToRegistration(
  guest: LumaGuest,
  eventId: string,
  existing?: Partial<Registration>
): Registration {
  const email = normalizeEmail(guest.user_email ?? "");
  const name =
    (guest.user_name ?? "").trim() ||
    `${(guest.user_first_name ?? "").trim()} ${(guest.user_last_name ?? "").trim()}`.trim() ||
    email;

  const rawTicket = ticketCategoryFromGuest(guest);
  const teamAnswer = guest.registration_answers?.find((a) => a.question_id === TEAM_QUESTION_ID);
  const teamAnswerRaw =
    typeof teamAnswer?.value === "string"
      ? teamAnswer.value
      : typeof teamAnswer?.answer === "string"
        ? teamAnswer.answer
        : "";

  const parsed = parseTeamAnswer(teamAnswerRaw, email);
  const ticketCategory = resolveEffectiveTicketCategory(rawTicket.ticketCategory, parsed);
  const ticketName =
    rawTicket.ticketCategory === "create_team" && ticketCategory === "find_team"
      ? FIND_TEAM_TICKET_NAME
      : rawTicket.ticketName;
  const ticketTypeId = rawTicket.ticketTypeId;
  const role = deriveRegistrationRole(ticketCategory, parsed);
  const now = new Date().toISOString();
  const id = registrationDocId(eventId, guest.id, email);

  const parsedTeamEmails =
    ticketCategory === "create_team" && !parsed.isIndividual ? parsed.teamEmails : [];
  const parsedTeamLeadEmail =
    ticketCategory === "join_team" && !parsed.isIndividual ? parsed.teamLeadEmail : null;

  return {
    id,
    eventId,
    lumaGuestId: guest.id,
    email,
    name,
    phone: guest.phone_number ?? null,
    ticketTypeId,
    ticketName,
    ticketCategory,
    teamAnswerRaw,
    parsedTeamEmails,
    parsedTeamLeadEmail,
    role,
    teamId: existing?.teamId ?? null,
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

export function getRegistrationField(reg: Registration, questionId: string): string | null {
  const match = reg.registrationAnswers.find((a) => a.questionId === questionId);
  return match?.answer ?? null;
}

export const PRIMARY_ROLE_QUESTION_ID = "vqdmckn6";
export const COMPANY_QUESTION_ID = "iiwj9n1z";
export const LINKEDIN_QUESTION_ID = "09j52uy4";
