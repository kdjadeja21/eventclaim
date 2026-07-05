import fs from "node:fs";
import path from "node:path";
import { hydrateRegistration, lumaGuestToRegistration } from "@/lib/registrations";
import { resolveTeamsFromRegistrations, computeFormationStats } from "@/lib/team-resolver";
import { devDataFilePath, isDevDataMode } from "@/lib/dev-mode";
import { normalizeEmail } from "@/lib/utils";
import type { LumaGuest } from "@/lib/luma";
import type {
  CachedTeamFormationStats,
  Event,
  Registration,
  Team,
  TeamIssue,
  TeamLink,
} from "@/lib/types";

export interface DevDataFile {
  version: 1;
  meta: {
    sourceFile: string;
    generatedAt: string;
    guestCount: number;
    lumaEventId: string;
    registrationCount: number;
    teamCount: number;
    poolCount: number;
  };
  event: Event;
  lumaGuests: LumaGuest[];
  registrations: Registration[];
  teams: Team[];
  teamLinks: TeamLink[];
}

let cache: DevDataFile | null = null;

function storePath(): string {
  return path.isAbsolute(devDataFilePath())
    ? devDataFilePath()
    : path.join(process.cwd(), devDataFilePath());
}

export function assertDevDataMode(): void {
  if (!isDevDataMode()) {
    throw new Error("Dev data mode is not enabled (set USE_DEV_DATA=true).");
  }
}

export function loadDevStore(): DevDataFile {
  assertDevDataMode();
  if (cache) return cache;

  const filePath = storePath();
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Dev data file not found at ${filePath}. Run: npm run dev:data:generate`
    );
  }

  cache = JSON.parse(fs.readFileSync(filePath, "utf8")) as DevDataFile;
  return cache;
}

export function saveDevStore(data: DevDataFile): void {
  assertDevDataMode();
  cache = data;
  fs.writeFileSync(storePath(), JSON.stringify(data, null, 2));
}

export function resetDevStoreCache(): void {
  cache = null;
}

export function getDevEventBySlug(slug: string): Event | null {
  const store = loadDevStore();
  return store.event.slug === slug ? store.event : null;
}

export function getDevEventById(id: string): Event | null {
  const store = loadDevStore();
  return store.event.id === id ? store.event : null;
}

export function listDevEvents(): Event[] {
  return [loadDevStore().event];
}

export function getDevTeams(): Team[] {
  return loadDevStore().teams;
}

export function getDevRegistrations(): Registration[] {
  return loadDevStore().registrations.map(hydrateRegistration);
}

export function getDevRegistrationsByIds(ids: string[]): Registration[] {
  const idSet = new Set(ids);
  return getDevRegistrations().filter((r) => idSet.has(r.id));
}

export function getDevTeamById(teamId: string): Team | null {
  return getDevTeams().find((t) => t.id === teamId) ?? null;
}

export function getDevPoolRegistrations(options: {
  limit?: number;
  cursor?: string | null;
}): { registrations: Registration[]; hasMore: boolean; nextCursor: string | null } {
  const limit = Math.min(options.limit ?? 50, 100);
  const pool = getDevRegistrations()
    .filter((r) => r.inPool && !r.teamId)
    .sort((a, b) => a.name.localeCompare(b.name));

  let startIndex = 0;
  if (options.cursor) {
    const idx = pool.findIndex((r) => r.id === options.cursor);
    startIndex = idx >= 0 ? idx + 1 : 0;
  }

  const slice = pool.slice(startIndex, startIndex + limit + 1);
  const hasMore = slice.length > limit;
  const page = hasMore ? slice.slice(0, limit) : slice;

  return {
    registrations: page,
    hasMore,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export function searchDevAssignableRegistrations(
  teamId: string,
  query: string,
  limit = 40
): Registration[] {
  const team = getDevTeamById(teamId);
  if (!team) return [];

  const blocked = new Set(
    [team.leadRegistrationId, ...team.memberRegistrationIds].filter(Boolean) as string[]
  );
  const q = query.trim().toLowerCase();

  return getDevRegistrations()
    .filter((r) => r.inPool && !r.teamId && !blocked.has(r.id))
    .filter((r) => {
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.ticketName.toLowerCase().includes(q)
      );
    })
    .slice(0, limit);
}

export function getDevLumaGuests(): LumaGuest[] {
  return loadDevStore().lumaGuests;
}

export function getDevLumaGuestsPage(options: {
  cursor?: string;
  limit?: number;
}): { entries: LumaGuest[]; has_more: boolean; next_cursor?: string } {
  const guests = getDevLumaGuests();
  const limit = options.limit ?? 50;
  let start = 0;
  if (options.cursor) {
    const idx = guests.findIndex((g) => g.id === options.cursor);
    start = idx >= 0 ? idx + 1 : 0;
  }
  const slice = guests.slice(start, start + limit + 1);
  const has_more = slice.length > limit;
  const entries = has_more ? slice.slice(0, limit) : slice;
  return {
    entries,
    has_more,
    next_cursor: has_more ? entries[entries.length - 1]?.id : undefined,
  };
}

function draftToTeam(
  draft: ReturnType<typeof resolveTeamsFromRegistrations>["drafts"][0],
  existing: Team | undefined,
  now: string
): Team {
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
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function devApplyTeamBuild(): {
  teamsCreated: number;
  teamsUpdated: number;
  registrationsLinked: number;
  poolCount: number;
} {
  const store = loadDevStore();
  const now = new Date().toISOString();
  const eventId = store.event.id;

  const registrations = store.registrations.map(hydrateRegistration);
  const existingTeams = store.teams;

  const confirmedAliases = new Map<string, string>();
  for (const link of store.teamLinks) {
    if (link.toRegistrationId) {
      confirmedAliases.set(normalizeEmail(link.toEmail), link.toRegistrationId);
    }
  }

  const { drafts, registrationTeamMap, poolRegistrationIds } = resolveTeamsFromRegistrations(
    eventId,
    registrations,
    existingTeams,
    { teamRules: store.event.teamRules, confirmedAliases }
  );

  const existingById = new Map(existingTeams.map((t) => [t.id, t]));
  let teamsCreated = 0;
  let teamsUpdated = 0;
  let registrationsLinked = 0;

  const teams: Team[] = [];
  for (const draft of drafts) {
    const existing = existingById.get(draft.id);
    teams.push(draftToTeam(draft, existing, now));
    if (existing) teamsUpdated++;
    else teamsCreated++;
  }

  for (const reg of registrations) {
    if (reg.isManualMapping) continue;
    const newTeamId = registrationTeamMap.get(reg.id) ?? null;
    const inPool = poolRegistrationIds.has(reg.id);
    if (reg.teamId !== newTeamId || reg.inPool !== inPool) registrationsLinked++;
    reg.teamId = newTeamId;
    reg.inPool = inPool;
    reg.updatedAt = now;
  }

  const formationStats: CachedTeamFormationStats = {
    ...computeFormationStats(teams, registrations, poolRegistrationIds),
    totalRegistrations: registrations.length,
    updatedAt: now,
  };

  store.teams = teams;
  store.registrations = registrations;
  store.event = {
    ...store.event,
    teamFormationStats: formationStats,
    lumaLastSyncedAt: now,
    updatedAt: now,
  };
  store.meta = {
    ...store.meta,
    registrationCount: registrations.length,
    teamCount: teams.length,
    poolCount: formationStats.poolCount,
  };

  saveDevStore(store);

  return {
    teamsCreated,
    teamsUpdated,
    registrationsLinked,
    poolCount: poolRegistrationIds.size,
  };
}

export function devUpsertLumaGuests(guests: LumaGuest[]): { saved: number; skipped: number } {
  const store = loadDevStore();
  const eventId = store.event.id;
  const now = new Date().toISOString();

  const guestById = new Map(store.lumaGuests.map((g) => [g.id, g]));
  const regById = new Map(store.registrations.map((r) => [r.id, r]));

  let saved = 0;
  let skipped = 0;

  for (const guest of guests) {
    const email = normalizeEmail(guest.user_email ?? "");
    if (!email) {
      skipped++;
      continue;
    }
    guestById.set(guest.id, guest);
    const existing = regById.get(guest.id);
    const registration = lumaGuestToRegistration(guest, eventId, {
      ...existing,
      teamId: existing?.teamId ?? null,
      isManualMapping: existing?.isManualMapping ?? false,
    });
    regById.set(registration.id, registration);
    saved++;
  }

  store.lumaGuests = [...guestById.values()];
  store.registrations = [...regById.values()];
  store.event.updatedAt = now;
  saveDevStore(store);

  return { saved, skipped };
}

export function devClearTeamData(): { deletedRegistrations: number; deletedTeams: number } {
  const store = loadDevStore();
  const deletedRegistrations = store.registrations.length;
  const deletedTeams = store.teams.length;
  store.registrations = [];
  store.teams = [];
  store.teamLinks = [];
  store.event.lumaLastSyncedAt = null;
  store.event.teamFormationStats = undefined;
  saveDevStore(store);
  return { deletedRegistrations, deletedTeams };
}

export function devUpdateTeam(teamId: string, patch: Partial<Team>): Team | null {
  const store = loadDevStore();
  const idx = store.teams.findIndex((t) => t.id === teamId);
  if (idx < 0) return null;
  store.teams[idx] = { ...store.teams[idx], ...patch, updatedAt: new Date().toISOString() };
  saveDevStore(store);
  return store.teams[idx];
}

export function devUpdateRegistration(
  regId: string,
  patch: Partial<Registration>
): Registration | null {
  const store = loadDevStore();
  const idx = store.registrations.findIndex((r) => r.id === regId);
  if (idx < 0) return null;
  store.registrations[idx] = {
    ...store.registrations[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveDevStore(store);
  return hydrateRegistration(store.registrations[idx]);
}

export function devAddTeamLink(link: TeamLink): void {
  const store = loadDevStore();
  store.teamLinks.push(link);
  saveDevStore(store);
}

export function devDeleteTeam(teamId: string): boolean {
  const store = loadDevStore();
  const team = store.teams.find((t) => t.id === teamId);
  if (!team) return false;

  const linkedIds = [
    ...(team.leadRegistrationId ? [team.leadRegistrationId] : []),
    ...team.memberRegistrationIds,
  ];

  store.teams = store.teams.filter((t) => t.id !== teamId);
  for (const reg of store.registrations) {
    if (linkedIds.includes(reg.id)) {
      reg.teamId = null;
      reg.inPool = true;
      reg.updatedAt = new Date().toISOString();
    }
  }
  saveDevStore(store);
  return true;
}

export function devCreateManualTeam(team: Team, linkedRegIds: string[]): void {
  const store = loadDevStore();
  store.teams.push(team);
  for (const regId of linkedRegIds) {
    const reg = store.registrations.find((r) => r.id === regId);
    if (reg) {
      reg.teamId = team.id;
      reg.inPool = false;
      reg.isManualMapping = true;
      reg.updatedAt = team.updatedAt;
    }
  }
  saveDevStore(store);
}

export function getDevRegistrationById(regId: string): Registration | null {
  const reg = loadDevStore().registrations.find((r) => r.id === regId);
  return reg ? hydrateRegistration(reg) : null;
}

export function devUpdateEvent(patch: Partial<Event>): Event {
  const store = loadDevStore();
  store.event = {
    ...store.event,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveDevStore(store);
  return store.event;
}

export function devAssignMemberToTeam(
  teamId: string,
  registrationId: string
): { success: boolean; error?: string } {
  const store = loadDevStore();
  const now = new Date().toISOString();
  const teamIdx = store.teams.findIndex((t) => t.id === teamId);
  const regIdx = store.registrations.findIndex((r) => r.id === registrationId);
  if (teamIdx < 0) return { success: false, error: "Team not found." };
  if (regIdx < 0) return { success: false, error: "Registration not found." };

  const team = store.teams[teamIdx];
  const reg = store.registrations[regIdx];

  if (reg.teamId && reg.teamId !== teamId) {
    const oldIdx = store.teams.findIndex((t) => t.id === reg.teamId);
    if (oldIdx >= 0) {
      const oldTeam = store.teams[oldIdx];
      store.teams[oldIdx] = {
        ...oldTeam,
        memberRegistrationIds: oldTeam.memberRegistrationIds.filter((id) => id !== registrationId),
        memberEmails: oldTeam.memberEmails.filter((e) => e !== reg.email),
        updatedAt: now,
      };
    }
  }

  store.teams[teamIdx] = {
    ...team,
    memberRegistrationIds: team.memberRegistrationIds.includes(registrationId)
      ? team.memberRegistrationIds
      : [...team.memberRegistrationIds, registrationId],
    memberEmails: team.memberEmails.includes(reg.email)
      ? team.memberEmails
      : [...team.memberEmails, reg.email],
    source: "manual",
    status: "manual",
    updatedAt: now,
  };

  store.registrations[regIdx] = {
    ...reg,
    teamId,
    isManualMapping: true,
    inPool: false,
    updatedAt: now,
  };

  saveDevStore(store);
  return { success: true };
}

export function devRemoveMemberFromTeam(
  teamId: string,
  registrationId: string
): { success: boolean; error?: string } {
  const store = loadDevStore();
  const now = new Date().toISOString();
  const teamIdx = store.teams.findIndex((t) => t.id === teamId);
  const regIdx = store.registrations.findIndex((r) => r.id === registrationId);
  if (teamIdx < 0) return { success: false, error: "Team not found." };
  if (regIdx < 0) return { success: false, error: "Registration not found." };

  const team = store.teams[teamIdx];
  const reg = store.registrations[regIdx];

  if (team.leadRegistrationId === registrationId) {
    return { success: false, error: "Cannot remove team lead. Reassign lead first." };
  }

  store.teams[teamIdx] = {
    ...team,
    memberRegistrationIds: team.memberRegistrationIds.filter((id) => id !== registrationId),
    memberEmails: team.memberEmails.filter((e) => e !== reg.email),
    source: "manual",
    status: "manual",
    updatedAt: now,
  };

  store.registrations[regIdx] = {
    ...reg,
    teamId: null,
    isManualMapping: true,
    inPool: true,
    updatedAt: now,
  };

  saveDevStore(store);
  return { success: true };
}

export function devMoveRegistrationToPool(
  registrationId: string
): { success: boolean; error?: string } {
  const store = loadDevStore();
  const now = new Date().toISOString();
  const regIdx = store.registrations.findIndex((r) => r.id === registrationId);
  if (regIdx < 0) return { success: false, error: "Registration not found." };

  const reg = store.registrations[regIdx];

  if (reg.teamId) {
    const teamIdx = store.teams.findIndex((t) => t.id === reg.teamId);
    if (teamIdx >= 0) {
      const team = store.teams[teamIdx];
      if (team.leadRegistrationId === registrationId) {
        return { success: false, error: "Cannot move team lead to pool. Reassign lead first." };
      }
      store.teams[teamIdx] = {
        ...team,
        memberRegistrationIds: team.memberRegistrationIds.filter((id) => id !== registrationId),
        memberEmails: team.memberEmails.filter((e) => e !== reg.email),
        updatedAt: now,
      };
    }
  }

  store.registrations[regIdx] = {
    ...reg,
    teamId: null,
    inPool: true,
    isManualMapping: true,
    updatedAt: now,
  };

  saveDevStore(store);
  return { success: true };
}

export function devRejectFuzzyLink(
  teamId: string,
  fromEmail: string,
  toRegistrationId: string
): { success: boolean; error?: string } {
  const store = loadDevStore();
  const teamIdx = store.teams.findIndex((t) => t.id === teamId);
  if (teamIdx < 0) return { success: false, error: "Team not found." };

  const team = store.teams[teamIdx];
  const normalizedFrom = normalizeEmail(fromEmail);
  const remainingLinks = (team.suggestedLinks ?? []).filter(
    (l) =>
      !(normalizeEmail(l.fromEmail) === normalizedFrom && l.toRegistrationId === toRegistrationId)
  );

  const issues: TeamIssue[] = team.issues.filter((i) => i !== "fuzzy_match_pending");
  if (remainingLinks.length > 0) issues.push("fuzzy_match_pending");

  store.teams[teamIdx] = {
    ...team,
    suggestedLinks: remainingLinks,
    issues,
    updatedAt: new Date().toISOString(),
  };
  saveDevStore(store);
  return { success: true };
}
