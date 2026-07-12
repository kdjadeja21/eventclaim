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
  if (lower.includes("create a team") || lower.includes("team lead")) return "lead";
  if (lower.includes("join a team") || lower.includes("teammate")) return "member";
  return "individual";
}

/**
 * Minimal union-find (disjoint-set) over email strings, used to group
 * attendees into teams purely from the actual cross-referenced emails in the
 * CSV — not just from ticket_name wording, which can vary between forms.
 */
class EmailUnionFind {
  private parent = new Map<string, string>();

  private ensure(email: string): string {
    if (!this.parent.has(email)) this.parent.set(email, email);
    return email;
  }

  find(email: string): string {
    this.ensure(email);
    let root = email;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression.
    let cur = email;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
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

  // ─── Pass 1: validate + extract per-row fields, without team grouping yet ──
  interface RowDraft {
    id: string;
    name: string;
    email: string;
    phone?: string;
    extra: Record<string, string>;
    ticketName: string | null;
    teamRole: ConfirmationTeamRole | null;
    teamEmails: string[]; // other emails this row references (lead or teammates)
  }

  const seenEmails = new Set<string>();
  const drafts: RowDraft[] = [];
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
    const teamEmails = [
      ...new Set(teamFieldValue.match(EMAIL_REGEX)?.map(normalizeEmail) ?? []),
    ].filter((e) => e !== email);

    seenEmails.add(email);
    drafts.push({
      id: hashString(email),
      name,
      email,
      phone,
      extra,
      ticketName,
      teamRole,
      teamEmails,
    });
  }

  // ─── Pass 2: group into teams by connected components ──────────────────────
  // Teams are derived directly from the actual email cross-references in the
  // CSV (whoever a row lists as lead/teammates), not just ticket_name wording
  // — e.g. a "Create a Team" lead listing 3 teammates' emails, and each of
  // those teammates listing the lead's email back, all end up in one
  // connected component regardless of exact ticket_name phrasing.
  const uf = new EmailUnionFind();
  for (const row of drafts) {
    uf.find(row.email); // ensure every attendee's own email is a node
    for (const other of row.teamEmails) {
      uf.union(row.email, other);
    }
  }

  const componentSize = new Map<string, number>();
  for (const row of drafts) {
    const root = uf.find(row.email);
    componentSize.set(root, (componentSize.get(root) ?? 0) + 1);
  }

  // Canonicalize each component's key to its lexicographically smallest email
  // so the same team gets the same teamKey across re-uploads/incremental CSVs,
  // regardless of row order or which member happened to anchor the union.
  const canonicalKey = new Map<string, string>();
  function getCanonicalKey(root: string): string {
    const existing = canonicalKey.get(root);
    if (existing) return existing;
    // Find the smallest email among all rows currently sharing this root.
    let smallest = root;
    for (const row of drafts) {
      if (uf.find(row.email) === root && row.email < smallest) smallest = row.email;
    }
    for (const other of drafts) {
      // Also consider referenced-but-not-yet-seen emails (e.g. a member whose
      // lead wasn't in this batch) so the key stays stable if the lead shows
      // up in this same batch under a different row order.
      for (const ref of other.teamEmails) {
        if (uf.find(ref) === root && ref < smallest) smallest = ref;
      }
    }
    canonicalKey.set(root, smallest);
    return smallest;
  }

  const rows: ParsedConfirmationAttendee[] = drafts.map((row) => {
    const root = uf.find(row.email);
    const isConnected = (componentSize.get(root) ?? 1) > 1;
    const teamKey = isConnected ? getCanonicalKey(root) : null;

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      extra: row.extra,
      teamKey,
      teamRole: row.teamRole,
      ticketName: row.ticketName,
    };
  });

  return { rows, invalidCount, skippedCount, errors };
}
