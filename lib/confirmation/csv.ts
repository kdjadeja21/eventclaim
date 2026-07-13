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

const EMAIL_REGEX = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/g;

/**
 * Finds the CSV column that holds team lead / teammate email(s) — e.g. the
 * long Luma custom question: "If you're a Team Lead, enter your team
 * members' email(s)... If you're registering individually, enter
 * 'Individual'." Matched generically by any raw header containing "team"
 * (case-insensitive), so it survives minor rewording between event forms.
 */
function findTeamColumnHeader(rawHeaders: string[]): string | null {
  return rawHeaders.find((h) => h.toLowerCase().includes("team")) ?? null;
}

function detectTeamIntentKind(ticketName: string | null): ConfirmationTeamIntentKind {
  if (!ticketName) return "individual";
  const lower = ticketName.toLowerCase();
  if (lower.includes("create a team") || lower.includes("team lead")) return "lead";
  if (lower.includes("join a team") || lower.includes("teammate")) return "member";
  return "individual";
}

function detectAnswerQuality(
  rawValue: string,
  referencedEmails: string[],
  selfEmail: string
): ConfirmationTeamAnswerQuality {
  if (!rawValue.trim()) return "empty";
  if (referencedEmails.length > 0) return "ok";
  if (/individual/i.test(rawValue)) return "individual";
  if (normalizeEmail(rawValue) === selfEmail) return "self_only";
  return "garbage";
}

function buildTeamIntent(
  ticketName: string | null,
  rawTeamFieldValue: string,
  selfEmail: string
): ConfirmationTeamIntent {
  const referencedEmails = [
    ...new Set((rawTeamFieldValue.match(EMAIL_REGEX) ?? []).map(normalizeEmail)),
  ].filter((e) => e && e !== selfEmail);

  const quality = detectAnswerQuality(rawTeamFieldValue, referencedEmails, selfEmail);
  const kind = detectTeamIntentKind(ticketName);

  return {
    kind,
    referencedEmails,
    rawValue: rawTeamFieldValue.trim() || null,
    quality,
  };
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

  const teamColumnHeader = findTeamColumnHeader(rawHeaders);

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

    const ticketName = getNormalized(raw, "ticket_name") || null;
    const teamFieldValue = teamColumnHeader ? (raw[teamColumnHeader] ?? "").trim() : "";
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
