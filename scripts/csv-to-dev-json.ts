/**
 * Converts a Luma guest CSV export into data/dev/hackathon-ahmedabad.json
 * for local development without Firebase or Luma API.
 *
 * Usage: npm run dev:data:generate -- [path/to/guests.csv]
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { lumaGuestToRegistration } from "../lib/registrations";
import { resolveTeamsFromRegistrations, computeFormationStats } from "../lib/team-resolver";
import type { LumaGuest, LumaRegistrationAnswer } from "../lib/luma";
import type {
  CachedTeamFormationStats,
  Event,
  Registration,
  Team,
} from "../lib/types";

const TEAM_QUESTION_ID = "lpwm5lcq";
const COMPANY_QUESTION_ID = "iiwj9n1z";
const PRIMARY_ROLE_QUESTION_ID = "vqdmckn6";
const LINKEDIN_QUESTION_ID = "09j52uy4";
const PROFESSION_QUESTION_ID = "prof-student";

const DEFAULT_CSV = path.join(
  process.cwd(),
  "data/dev/source/hackathon-guests.csv"
);
const OUTPUT = path.join(process.cwd(), "data/dev/hackathon-ahmedabad.json");

const LUMA_EVENT_ID = "evt-uGQ6rjkFLqwH7Ek";
const EVENT_ID = "dev-hackathon-ahmedabad";
const EVENT_SLUG = "cursor-hackathon-ahmedabad";

type CsvRow = Record<string, string>;

function col(row: CsvRow, ...keys: string[]): string {
  for (const key of keys) {
    const val = row[key]?.trim();
    if (val) return val;
  }
  return "";
}

function answer(label: string, questionId: string, value: string): LumaRegistrationAnswer | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return {
    label,
    question_id: questionId,
    value: trimmed,
    question_type: "text",
    answer: trimmed,
  };
}

function rowToLumaGuest(row: CsvRow): LumaGuest | null {
  const email = col(row, "email").toLowerCase();
  const guestId = col(row, "guest_id");
  if (!email || !guestId) return null;

  const teamAnswer = col(
    row,
    "If you're a Team Lead, enter your team members' email(s). If you're a Joining any team as a teammate then enter your Team Lead's email. If you're registering individually, enter \"Individual\"."
  );

  const answers: LumaRegistrationAnswer[] = [];
  const push = (a: LumaRegistrationAnswer | null) => {
    if (a) answers.push(a);
  };

  push(answer("Team emails", TEAM_QUESTION_ID, teamAnswer));
  push(
    answer(
      "Professional or student",
      PROFESSION_QUESTION_ID,
      col(row, "Are you a Professional or a student?")
    )
  );
  push(
    answer(
      "Company / college",
      COMPANY_QUESTION_ID,
      col(row, "What company do you work for? Enter college name if you are student")
    )
  );
  push(answer("LinkedIn", LINKEDIN_QUESTION_ID, col(row, "What is your LinkedIn profile?")));
  push(answer("Primary role", PRIMARY_ROLE_QUESTION_ID, col(row, "Primary role")));

  const ticketTypeId = col(row, "ticket_type_id");
  const ticketName = col(row, "ticket_name");

  return {
    id: guestId,
    user_id: guestId,
    user_email: email,
    user_name: col(row, "name") || null,
    user_first_name: col(row, "first_name") || null,
    user_last_name: col(row, "last_name") || null,
    approval_status: (col(row, "approval_status") || "pending_approval") as LumaGuest["approval_status"],
    registered_at: col(row, "created_at") || null,
    checked_in_at: col(row, "checked_in_at") || null,
    phone_number: col(row, "phone_number") || null,
    registration_answers: answers,
    event_tickets: ticketTypeId
      ? [
          {
            id: `ticket-${guestId}`,
            amount: 0,
            amount_discount: 0,
            amount_tax: 0,
            currency: "usd",
            checked_in_at: col(row, "checked_in_at") || null,
            event_ticket_type_id: ticketTypeId,
            is_captured: true,
            name: ticketName || "Ticket",
          },
        ]
      : [],
  };
}

function buildDevEvent(now: string): Event {
  return {
    id: EVENT_ID,
    name: "Cursor Hackathon Ahmedabad",
    slug: EVENT_SLUG,
    date: "2026-07-12",
    notionGuideUrl: "https://notion.so/dev-placeholder",
    status: "active",
    createdAt: now,
    updatedAt: now,
    lumaEventId: LUMA_EVENT_ID,
    lumaLastSyncedAt: now,
    teamRules: { minSize: 3, maxSize: 4, allowOversized: false },
  };
}

function draftToTeam(draft: ReturnType<typeof resolveTeamsFromRegistrations>["drafts"][0], now: string): Team {
  return {
    id: draft.id,
    eventId: draft.eventId,
    name: draft.name,
    leadRegistrationId: draft.leadRegistrationId,
    leadEmail: draft.leadEmail,
    memberRegistrationIds: draft.memberRegistrationIds,
    memberEmails: draft.memberEmails,
    expectedMemberEmails: draft.expectedMemberEmails,
    ticketCategory: draft.ticketCategory,
    status: draft.status,
    source: draft.source,
    issues: draft.issues,
    confidence: draft.confidence,
    suggestedLinks: draft.suggestedLinks,
    sizeExpected: draft.sizeExpected,
    sizeActual: draft.sizeActual,
    reviewSummary: draft.reviewSummary,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV;
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, "utf8");
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    console.warn("CSV parse warnings:", parsed.errors.slice(0, 5));
  }

  const lumaGuests: LumaGuest[] = [];
  for (const row of parsed.data) {
    const guest = rowToLumaGuest(row);
    if (guest) lumaGuests.push(guest);
  }

  const now = new Date().toISOString();
  const event = buildDevEvent(now);

  const registrations: Registration[] = lumaGuests.map((guest) =>
    lumaGuestToRegistration(guest, EVENT_ID, undefined, {
      teamQuestionId: TEAM_QUESTION_ID,
    })
  );

  const { drafts, registrationTeamMap, poolRegistrationIds } = resolveTeamsFromRegistrations(
    EVENT_ID,
    registrations,
    []
  );

  const teams = drafts.map((d) => draftToTeam(d, now));

  for (const reg of registrations) {
    if (reg.isManualMapping) continue;
    reg.teamId = registrationTeamMap.get(reg.id) ?? null;
    reg.inPool = poolRegistrationIds.has(reg.id);
    reg.updatedAt = now;
  }

  const formationStats: CachedTeamFormationStats = {
    ...computeFormationStats(teams, registrations, poolRegistrationIds),
    totalRegistrations: registrations.length,
    updatedAt: now,
  };

  event.teamFormationStats = formationStats;

  const output = {
    version: 1 as const,
    meta: {
      sourceFile: path.basename(csvPath),
      generatedAt: now,
      guestCount: lumaGuests.length,
      lumaEventId: LUMA_EVENT_ID,
      registrationCount: registrations.length,
      teamCount: teams.length,
      poolCount: formationStats.poolCount,
    },
    event,
    lumaGuests,
    registrations,
    teams,
    teamLinks: [] as unknown[],
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));

  console.log(`Wrote ${OUTPUT}`);
  console.log(
    `  ${lumaGuests.length} guests → ${registrations.length} registrations → ${teams.length} teams (${formationStats.poolCount} in pool)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
