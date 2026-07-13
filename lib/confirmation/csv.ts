import Papa from "papaparse";
import { normalizeEmail, hashString } from "@/lib/utils";
import { z } from "zod";
import {
  ConfirmationTeamAnswerQuality,
  ConfirmationTeamIntent,
  ConfirmationTeamIntentKind,
} from "@/lib/confirmation/types";

// ─── Confirmation Attendee CSV Parsing ─────────────────────────────────────────
// Tolerant of arbitrary columns (e.g. a Luma "approved attendees" export).
// Requires a `name` (or first_name/last_name) and `email` column; optional
// `phone`/`phone_number`; everything else is preserved verbatim into `extra`,
// keyed by the RAW original header (so long survey questions stay readable).
//
// Team formation itself is NOT done here — this only parses each row's raw
// team-question signal (teamIntent). Actual team grouping runs later, across
// every attendee currently stored (not just this upload), via
// lib/confirmation/team-resolver.ts. That lets a lead uploaded today and a
// teammate uploaded next week still end up on the same team.

export interface ParsedConfirmationAttendee {
  id: string; // hashString(normalizedEmail)
  name: string;
  email: string;
  phone?: string;
  extra: Record<string, string>;
  ticketName: string | null;
  teamIntent: ConfirmationTeamIntent;
}

export interface ConfirmationCsvParseResult {
  rows: ParsedConfirmationAttendee[];
  invalidCount: number;
  skippedCount: number; // rows filtered out by the approval_status guard
  errors: string[];
}

const KNOWN_HEADER_KEYS = new Set([
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "phone_number",
  "approval_status",
]);

const TICKET_HEADER_KEYS = [
  "ticket_name",
  "ticket",
  "ticket_type",
  "ticket_title",
  "ticket_tier",
];

export const EMAIL_REGEX = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/g;

/**
 * Picks the CSV column that holds team lead / teammate email(s).
 *
 * Prefer columns whose values actually contain emails (so a yes/no
 * "Are you on a team?" column doesn't shadow the real question). Falls back
 * to the longest header mentioning team/teammate/lead+email — Luma's custom
 * questions are typically long.
 */
export function findTeamColumnHeader(
  rawHeaders: string[],
  sampleRows: Record<string, string>[] = []
): string | null {
  const candidates = rawHeaders.filter((h) => {
    const lower = h.toLowerCase();
    if (lower.includes("ticket")) return false;
    if (lower === "email" || lower === "name") return false;
    return (
      lower.includes("team") ||
      lower.includes("teammate") ||
      (lower.includes("member") && lower.includes("email")) ||
      (lower.includes("lead") && lower.includes("email")) ||
      (lower.includes("partner") && lower.includes("email"))
    );
  });

  if (candidates.length === 0) {
    // Last-resort: any non-identity column that is dense with emails.
    const scored = rawHeaders
      .filter((h) => {
        const n = h.trim().toLowerCase().replace(/\s+/g, "_");
        return !KNOWN_HEADER_KEYS.has(n) && !n.includes("ticket");
      })
      .map((h) => ({ header: h, score: scoreColumnForEmails(h, sampleRows) }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored[0]?.header ?? null;
  }

  const scored = candidates
    .map((h) => ({
      header: h,
      score: scoreColumnForEmails(h, sampleRows),
      length: h.length,
    }))
    .sort((a, b) => b.score - a.score || b.length - a.length);

  if (scored[0]?.score > 0) return scored[0].header;

  // No emails observed yet (empty export / all "Individual") — prefer the
  // longest "team" question header, which is usually the Luma custom field.
  return scored[0]?.header ?? null;
}

function scoreColumnForEmails(
  header: string,
  sampleRows: Record<string, string>[]
): number {
  let emailCount = 0;
  let individualMentions = 0;
  for (const row of sampleRows.slice(0, 300)) {
    const val = (row[header] ?? "").trim();
    if (!val) continue;
    const found = val.match(EMAIL_REGEX);
    if (found) emailCount += found.length;
    if (/individual/i.test(val)) individualMentions++;
  }
  // Emails dominate; "Individual" answers confirm this is the team question.
  return emailCount * 10 + individualMentions;
}

/**
 * Reads ticket / registration type from common Luma/export header variants.
 */
export function findTicketName(
  getNormalized: (key: string) => string,
  rawHeaders: string[],
  rawRow: Record<string, string>
): string | null {
  for (const key of TICKET_HEADER_KEYS) {
    const value = getNormalized(key);
    if (value) return value;
  }

  for (const rawHeader of rawHeaders) {
    const lower = rawHeader.toLowerCase();
    if (!lower.includes("ticket")) continue;
    if (lower.includes("ticket_id") || lower.includes("ticket id")) continue;
    const value = (rawRow[rawHeader] ?? "").trim();
    if (value) return value;
  }

  return null;
}

export function detectAnswerQuality(
  rawValue: string,
  referencedEmails: string[],
  selfEmail: string
): ConfirmationTeamAnswerQuality {
  if (!rawValue.trim()) return "empty";
  if (referencedEmails.length > 0) return "ok";
  if (/^\s*individual\s*$/i.test(rawValue) || /^individual\b/i.test(rawValue.trim())) {
    return "individual";
  }
  if (normalizeEmail(rawValue) === selfEmail) return "self_only";
  return "garbage";
}

/**
 * Classifies lead / member / individual / ambiguous from ticket label + the
 * emails found in the team question. Ticket text is preferred when it clearly
 * says lead/member; otherwise we fall back to how many emails they listed
 * (multiple → forming a team / lead, one → joining or listing a lead).
 */
export function detectTeamIntentKind(
  ticketName: string | null,
  referencedEmails: string[],
  quality: ConfirmationTeamAnswerQuality
): ConfirmationTeamIntentKind {
  if (quality === "individual" && referencedEmails.length === 0) {
    return "individual";
  }

  const ticket = (ticketName ?? "").toLowerCase().trim();

  const ticketSaysIndividual =
    /\bindividual\b/.test(ticket) ||
    /\bsolo\b/.test(ticket) ||
    /\bsingle\b/.test(ticket) ||
    ticket.includes("general admission") ||
    ticket.includes("ga ticket");

  if (ticketSaysIndividual && referencedEmails.length === 0) {
    return "individual";
  }

  const ticketSaysLead =
    ticket.includes("create a team") ||
    ticket.includes("create team") ||
    ticket.includes("creating a team") ||
    ticket.includes("team lead") ||
    ticket.includes("team leader") ||
    ticket.includes("team-lead") ||
    ticket.includes("team_lead") ||
    (/\blead\b/.test(ticket) && ticket.includes("team")) ||
    ticket === "lead" ||
    ticket === "team lead";

  if (ticketSaysLead) return "lead";

  const ticketSaysMember =
    ticket.includes("join a team") ||
    ticket.includes("join team") ||
    ticket.includes("joining a team") ||
    ticket.includes("joining team") ||
    ticket.includes("teammate") ||
    ticket.includes("team member") ||
    ticket.includes("team-member") ||
    ticket.includes("team_member") ||
    (/\bmember\b/.test(ticket) && ticket.includes("team")) ||
    ticket === "member" ||
    ticket === "teammate";

  if (ticketSaysMember) return "member";

  // Content-based fallback when the ticket is missing or generic ("VIP",
  // "Standard", etc.) but the team question has emails.
  if (referencedEmails.length >= 2) return "lead";
  if (referencedEmails.length === 1) return "ambiguous";

  if (
    quality === "empty" ||
    quality === "garbage" ||
    quality === "self_only" ||
    quality === "individual"
  ) {
    return "individual";
  }

  return "individual";
}

export function buildTeamIntent(
  ticketName: string | null,
  rawTeamFieldValue: string,
  selfEmail: string
): ConfirmationTeamIntent {
  const referencedEmails = [
    ...new Set((rawTeamFieldValue.match(EMAIL_REGEX) ?? []).map(normalizeEmail)),
  ].filter((e) => e && e !== normalizeEmail(selfEmail));

  const quality = detectAnswerQuality(
    rawTeamFieldValue,
    referencedEmails,
    normalizeEmail(selfEmail)
  );
  const kind = detectTeamIntentKind(ticketName, referencedEmails, quality);

  return {
    kind,
    referencedEmails,
    rawValue: rawTeamFieldValue.trim() || null,
    quality,
  };
}

/**
 * Re-derive kind from already-stored ticketName + teamIntent. Used by the
 * resolver so clicking "Resolve Teams" can fix classifications without a
 * fresh CSV upload (e.g. after detection rules improve).
 */
export function refineTeamIntent(
  ticketName: string | null | undefined,
  intent: ConfirmationTeamIntent | null | undefined
): ConfirmationTeamIntent | null {
  if (!intent) return null;
  const kind = detectTeamIntentKind(
    ticketName ?? null,
    intent.referencedEmails ?? [],
    intent.quality
  );
  if (kind === intent.kind) return intent;
  return { ...intent, kind };
}

/**
 * Rebuild teamIntent from stored attendee fields, recovering emails that may
 * only live in `extra` when the original upload picked the wrong team column
 * (common cause of "everyone is an individual").
 */
export function recoverTeamIntentFromAttendee(attendee: {
  email: string;
  ticketName?: string | null;
  teamIntent?: ConfirmationTeamIntent | null;
  extra?: Record<string, string>;
}): ConfirmationTeamIntent {
  const existing = attendee.teamIntent ?? null;
  const ticketName = attendee.ticketName ?? null;

  if ((existing?.referencedEmails?.length ?? 0) > 0) {
    return refineTeamIntent(ticketName, existing) ?? existing!;
  }

  const candidates: Array<{ header: string; value: string }> = [];
  if (existing?.rawValue) {
    candidates.push({ header: "__raw__", value: existing.rawValue });
  }

  for (const [header, value] of Object.entries(attendee.extra ?? {})) {
    if (!value?.trim()) continue;
    const lower = header.toLowerCase();
    if (lower.includes("ticket")) continue;
    candidates.push({ header, value });
  }

  let bestValue = existing?.rawValue ?? "";
  let bestScore = -1;

  for (const { header, value } of candidates) {
    const lower = header.toLowerCase();
    const emailCount = (value.match(EMAIL_REGEX) ?? []).length;
    const looksTeam =
      header === "__raw__" ||
      lower.includes("team") ||
      lower.includes("teammate") ||
      (lower.includes("member") && lower.includes("email")) ||
      (lower.includes("lead") && lower.includes("email"));
    const individualMention = /individual/i.test(value) ? 1 : 0;
    const score =
      emailCount * 10 + (looksTeam ? 2 : 0) + individualMention;
    if (score > bestScore) {
      bestScore = score;
      bestValue = value;
    }
  }

  if (bestScore <= 0 && existing) {
    return refineTeamIntent(ticketName, existing) ?? existing;
  }

  return buildTeamIntent(ticketName, bestValue, attendee.email);
}

export function parseConfirmationAttendeeCsv(
  csv: string,
  opts: { onlyApproved?: boolean } = {}
): ConfirmationCsvParseResult {
  const { onlyApproved = true } = opts;

  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  // Map of normalized header -> raw original header, so we can look values
  // up by normalized key but store extras keyed by the raw text.
  const rawHeaders = result.meta.fields ?? [];
  const normalizedToRaw = new Map<string, string>();
  for (const raw of rawHeaders) {
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, "_");
    normalizedToRaw.set(normalized, raw);
  }

  const teamColumnHeader = findTeamColumnHeader(rawHeaders, result.data);

  function getNormalized(raw: Record<string, string>, key: string): string {
    const rawKey = normalizedToRaw.get(key);
    if (!rawKey) return "";
    return (raw[rawKey] ?? "").trim();
  }

  const seenEmails = new Set<string>();
  const rows: ParsedConfirmationAttendee[] = [];
  let invalidCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const raw of result.data) {
    const emailRaw = getNormalized(raw, "email");
    const email = normalizeEmail(emailRaw);

    if (!email || !z.string().email().safeParse(email).success) {
      invalidCount++;
      errors.push(`Invalid email: "${emailRaw}"`);
      continue;
    }

    if (seenEmails.has(email)) continue;

    const approvalStatus = getNormalized(raw, "approval_status").toLowerCase();
    if (onlyApproved && approvalStatus && approvalStatus !== "approved") {
      skippedCount++;
      continue;
    }

    const name =
      getNormalized(raw, "name") ||
      `${getNormalized(raw, "first_name")} ${getNormalized(raw, "last_name")}`.trim() ||
      email;

    const phone =
      getNormalized(raw, "phone") || getNormalized(raw, "phone_number") || undefined;

    // Preserve every other raw column verbatim, keyed by the original header.
    const extra: Record<string, string> = {};
    for (const rawHeader of rawHeaders) {
      const normalized = rawHeader.trim().toLowerCase().replace(/\s+/g, "_");
      if (KNOWN_HEADER_KEYS.has(normalized)) continue;
      const value = (raw[rawHeader] ?? "").trim();
      if (value) extra[rawHeader] = value;
    }

    const ticketName = findTicketName(
      (key) => getNormalized(raw, key),
      rawHeaders,
      raw
    );
    const teamFieldValue = teamColumnHeader
      ? (raw[teamColumnHeader] ?? "").trim()
      : "";
    const teamIntent = buildTeamIntent(ticketName, teamFieldValue, email);

    seenEmails.add(email);
    rows.push({
      id: hashString(email),
      name,
      email,
      phone,
      extra,
      ticketName,
      teamIntent,
    });
  }

  return { rows, invalidCount, skippedCount, errors };
}
