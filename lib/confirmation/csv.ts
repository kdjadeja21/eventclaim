import Papa from "papaparse";
import { normalizeEmail, hashString } from "@/lib/utils";
import { z } from "zod";
import { ConfirmationTeamRole } from "@/lib/confirmation/types";

// ─── Confirmation Attendee CSV Parsing ─────────────────────────────────────────
// Tolerant of arbitrary columns (e.g. a Luma "approved attendees" export).
// Requires a `name` (or first_name/last_name) and `email` column; optional
// `phone`/`phone_number`; everything else is preserved verbatim into `extra`,
// keyed by the RAW original header (so long survey questions stay readable).

export interface ParsedConfirmationAttendee {
  id: string; // hashString(normalizedEmail)
  name: string;
  email: string;
  phone?: string;
  extra: Record<string, string>;
  teamKey: string | null;
  teamRole: ConfirmationTeamRole | null;
  ticketName: string | null;
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

function detectTeamRole(ticketName: string): ConfirmationTeamRole {
  const lower = ticketName.toLowerCase();
  if (lower.includes("create a team")) return "lead";
  if (lower.includes("join a team")) return "member";
  return "individual";
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
    const teamRole = ticketName ? detectTeamRole(ticketName) : null;
    const teamFieldValue = teamColumnHeader ? (raw[teamColumnHeader] ?? "").trim() : "";
    const teamEmails = teamFieldValue.match(EMAIL_REGEX)?.map(normalizeEmail) ?? [];

    let teamKey: string | null = null;
    if (teamRole === "lead") {
      // The lead is the anchor of their own team.
      teamKey = email;
    } else if (teamRole === "member" && teamEmails.length > 0) {
      // Teammates reference their lead's email — use it as the shared key.
      teamKey = teamEmails[0];
    }

    seenEmails.add(email);
    rows.push({
      id: hashString(email),
      name,
      email,
      phone,
      extra,
      teamKey,
      teamRole,
      ticketName,
    });
  }

  return { rows, invalidCount, skippedCount, errors };
}
