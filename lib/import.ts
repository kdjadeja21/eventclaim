import Papa from "papaparse";
import { normalizeEmail, hashString } from "@/lib/utils";
import { z } from "zod";

// ─── Attendee CSV Parsing (real Luma schema) ──────────────────────────────────

export interface ParsedAttendee {
  name: string;
  email: string;
  checkedIn: boolean;
}

export interface AttendeeParseResult {
  rows: ParsedAttendee[];
  invalidCount: number;
  errors: string[];
}

/**
 * Parses a Luma CSV export (24+ columns) and extracts name + email.
 * Prefers the `name` column; falls back to `first_name + last_name`.
 * Tolerant of extra columns and column order.
 */
export function parseLumaAttendeeCsv(
  csv: string,
  checkedInOnly = true
): AttendeeParseResult {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });

  const seenEmails = new Set<string>();
  const rows: ParsedAttendee[] = [];
  let invalidCount = 0;
  const errors: string[] = [];

  for (const raw of result.data) {
    const emailRaw = raw["email"] ?? "";
    const email = normalizeEmail(emailRaw);

    if (!email || !z.string().email().safeParse(email).success) {
      invalidCount++;
      errors.push(`Invalid email: "${emailRaw}"`);
      continue;
    }

    const name =
      (raw["name"] ?? "").trim() ||
      `${(raw["first_name"] ?? "").trim()} ${(raw["last_name"] ?? "").trim()}`.trim() ||
      email;

    const checkedInAt = (raw["checked_in_at"] ?? "").trim();
    const checkedIn = checkedInAt !== "" && checkedInAt !== "null";

    if (checkedInOnly && !checkedIn) continue;

    if (seenEmails.has(email)) continue;
    seenEmails.add(email);

    rows.push({ name, email, checkedIn });
  }

  return { rows, invalidCount, errors };
}

// ─── Coupon CSV Parsing ────────────────────────────────────────────────────────

export interface ParsedCoupon {
  couponLink: string;
}

export interface CouponParseResult {
  rows: ParsedCoupon[];
  invalidCount: number;
  errors: string[];
}

const urlSchema = z.string().url();

/**
 * Parses a coupon CSV (single column of URLs, header or no header).
 * Accepts bare URLs (one per line) or a CSV with a header like "coupon_link".
 * Every uploaded link is treated as unique — links are never deduplicated,
 * so the same URL may appear multiple times across rows/uploads.
 */
export function parseCouponCsv(csv: string): CouponParseResult {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: ParsedCoupon[] = [];
  let invalidCount = 0;
  const errors: string[] = [];

  for (const line of lines) {
    // Skip header rows
    if (
      line.toLowerCase().startsWith("coupon") ||
      line.toLowerCase() === "link" ||
      line.toLowerCase() === "url"
    ) {
      continue;
    }

    // Strip surrounding quotes
    const couponLink = line.replace(/^["']|["']$/g, "").trim();

    if (!urlSchema.safeParse(couponLink).success) {
      invalidCount++;
      errors.push(`Invalid URL: "${couponLink}"`);
      continue;
    }

    rows.push({ couponLink });
  }

  return { rows, invalidCount, errors };
}

/**
 * Generates a deterministic document ID from an email + eventId.
 * Ensures idempotent re-uploads.
 */
export function attendeeDocId(eventId: string, email: string): string {
  return hashString(`${eventId}:${email}`);
}

/**
 * Generates a deterministic document ID from a coupon link.
 */
export function couponDocId(eventId: string, couponLink: string): string {
  return hashString(`${eventId}:${couponLink}`);
}
