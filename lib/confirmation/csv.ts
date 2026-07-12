import Papa from "papaparse";
import { normalizeEmail, hashString } from "@/lib/utils";
import { z } from "zod";

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

    seenEmails.add(email);
    rows.push({
      id: hashString(email),
      name,
      email,
      phone,
      extra,
    });
  }

  return { rows, invalidCount, skippedCount, errors };
}
