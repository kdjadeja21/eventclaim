"use server";

import { adminDb } from "@/lib/firebase/admin";
import { hydrateRegistration } from "@/lib/registrations";
import {
  batchGetRegistrations,
  collectTeamRegistrationIds,
  getEventBySlugCached,
  isFirestoreQuotaError,
} from "@/lib/event-resolve";
import { requireSession } from "@/lib/session";
import {
  CachedTeamFormationStats,
  Event,
  Registration,
  Team,
  TeamFormationStats,
  TeamWithMembers,
} from "@/lib/types";

function statsFromTeams(teams: Team[]): TeamFormationStats & { totalRegistrations: number } {
  return {
    formedTeams: teams.length,
    completeTeams: teams.filter((t) => t.status === "complete").length,
    incompleteTeams: teams.filter((t) => t.status === "incomplete").length,
    needsReviewTeams: teams.filter((t) => t.status === "needs_review").length,
    poolCount: 0,
    autoResolvedPercent: 0,
    totalRegistrations: 0,
  };
}

function resolveStats(
  event: Event,
  teams: Team[]
): TeamFormationStats & { totalRegistrations: number } {
  if (event.teamFormationStats) {
    return {
      formedTeams: event.teamFormationStats.formedTeams,
      completeTeams: event.teamFormationStats.completeTeams,
      incompleteTeams: event.teamFormationStats.incompleteTeams,
      needsReviewTeams: event.teamFormationStats.needsReviewTeams,
      poolCount: event.teamFormationStats.poolCount,
      autoResolvedPercent: event.teamFormationStats.autoResolvedPercent,
      totalRegistrations: event.teamFormationStats.totalRegistrations,
    };
  }
  return statsFromTeams(teams);
}

export interface TeamsPageData {
  eventId: string;
  event: Event;
  teams: Team[];
  /** Registrations linked to formed teams (not the full pool). */
  teamRegistrations: Registration[];
  stats: TeamFormationStats & { totalRegistrations: number };
}

export class TeamsDataError extends Error {
  constructor(
    message: string,
    public readonly code: "quota_exceeded" | "not_found" | "unknown"
  ) {
    super(message);
    this.name = "TeamsDataError";
  }
}

export async function getTeamsPageData(slug: string): Promise<TeamsPageData> {
  await requireSession();

  try {
    const event = await getEventBySlugCached(slug);
    if (!event) throw new TeamsDataError("Event not found", "not_found");

    const eventId = event.id;
    const teamsSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("teams")
      .get();

    const teams = teamsSnap.docs.map((d) => d.data() as Team);
    const regIds = collectTeamRegistrationIds(teams);
    const teamRegistrations = await batchGetRegistrations(eventId, regIds);

    return {
      eventId,
      event,
      teams,
      teamRegistrations,
      stats: resolveStats(event, teams),
    };
  } catch (err) {
    if (err instanceof TeamsDataError) throw err;
    if (isFirestoreQuotaError(err)) {
      throw new TeamsDataError(
        "Firestore read quota exceeded. Try again later or rebuild teams to refresh cached stats.",
        "quota_exceeded"
      );
    }
    throw err;
  }
}

export interface PoolRegistrationsPage {
  registrations: Registration[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function getPoolRegistrationsPage(
  slug: string,
  options: { limit?: number; cursor?: string | null } = {}
): Promise<PoolRegistrationsPage> {
  await requireSession();
  const limit = Math.min(options.limit ?? 50, 100);
  const event = await getEventBySlugCached(slug);
  if (!event) throw new TeamsDataError("Event not found", "not_found");

  const regsRef = adminDb.collection("events").doc(event.id).collection("registrations");
  let query = regsRef.where("inPool", "==", true).limit(limit + 1);

  if (options.cursor) {
    const cursorSnap = await regsRef.doc(options.cursor).get();
    if (cursorSnap.exists) {
      query = regsRef
        .where("inPool", "==", true)
        .startAfter(cursorSnap)
        .limit(limit + 1);
    }
  }

  const snap = await query.get();
  const docs = snap.docs;
  const hasMore = docs.length > limit;
  const pageDocs = hasMore ? docs.slice(0, limit) : docs;

  const registrations = pageDocs
    .map((d) => hydrateRegistration(d.data() as Registration))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    registrations,
    hasMore,
    nextCursor: hasMore ? pageDocs[pageDocs.length - 1]?.id ?? null : null,
  };
}

export async function searchAssignableRegistrations(
  slug: string,
  teamId: string,
  query: string,
  limit = 40
): Promise<Registration[]> {
  await requireSession();
  const event = await getEventBySlugCached(slug);
  if (!event) return [];

  const teamSnap = await adminDb
    .collection("events")
    .doc(event.id)
    .collection("teams")
    .doc(teamId)
    .get();
  if (!teamSnap.exists) return [];
  const team = teamSnap.data() as Team;

  const snap = await adminDb
    .collection("events")
    .doc(event.id)
    .collection("registrations")
    .where("inPool", "==", true)
    .limit(200)
    .get();

  const q = query.trim().toLowerCase();
  const blocked = new Set([
    team.leadRegistrationId,
    ...team.memberRegistrationIds,
  ].filter(Boolean) as string[]);

  return snap.docs
    .map((d) => hydrateRegistration(d.data() as Registration))
    .filter((r) => !blocked.has(r.id))
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

export async function getTeamDetail(
  slug: string,
  teamId: string
): Promise<TeamWithMembers | null> {
  await requireSession();
  const event = await getEventBySlugCached(slug);
  if (!event) return null;

  const eventId = event.id;
  const teamSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("teams")
    .doc(teamId)
    .get();

  if (!teamSnap.exists) return null;

  const team = teamSnap.data() as Team;
  const regIds = [
    ...(team.leadRegistrationId ? [team.leadRegistrationId] : []),
    ...team.memberRegistrationIds,
  ];
  const registrations = await batchGetRegistrations(eventId, regIds);
  const regMap = new Map(registrations.map((r) => [r.id, r]));

  return {
    ...team,
    lead: team.leadRegistrationId ? regMap.get(team.leadRegistrationId) ?? null : null,
    members: team.memberRegistrationIds
      .map((id) => regMap.get(id))
      .filter((r): r is Registration => Boolean(r)),
  };
}
