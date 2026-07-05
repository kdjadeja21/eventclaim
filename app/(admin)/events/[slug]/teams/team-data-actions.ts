"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { Registration, Team, TeamWithMembers } from "@/lib/types";

async function resolveEventId(slug: string): Promise<string> {
  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");
  return eventSnap.docs[0].id;
}

export interface TeamsPageData {
  eventId: string;
  teams: Team[];
  registrations: Registration[];
  stats: {
    totalTeams: number;
    createTeam: number;
    joinTeam: number;
    findTeam: number;
    incomplete: number;
    unassigned: number;
  };
}

export async function getTeamsPageData(slug: string): Promise<TeamsPageData> {
  await requireSession();
  const eventId = await resolveEventId(slug);

  const [teamsSnap, regsSnap] = await Promise.all([
    adminDb.collection("events").doc(eventId).collection("teams").get(),
    adminDb.collection("events").doc(eventId).collection("registrations").get(),
  ]);

  const teams = teamsSnap.docs.map((d) => d.data() as Team);
  const registrations = regsSnap.docs.map((d) => d.data() as Registration);

  const stats = {
    totalTeams: teams.length,
    createTeam: teams.filter((t) => t.ticketCategory === "create_team").length,
    joinTeam: teams.filter((t) => t.ticketCategory === "join_team").length,
    findTeam: teams.filter((t) => t.ticketCategory === "find_team").length,
    incomplete: teams.filter((t) => t.status === "incomplete").length,
    unassigned: teams.filter((t) => t.status === "unassigned").length,
  };

  return { eventId, teams, registrations, stats };
}

export async function getTeamDetail(
  slug: string,
  teamId: string
): Promise<TeamWithMembers | null> {
  await requireSession();
  const eventId = await resolveEventId(slug);

  const teamSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("teams")
    .doc(teamId)
    .get();

  if (!teamSnap.exists) return null;

  const team = teamSnap.data() as Team;
  const regsRef = adminDb.collection("events").doc(eventId).collection("registrations");

  const regIds = [
    ...(team.leadRegistrationId ? [team.leadRegistrationId] : []),
    ...team.memberRegistrationIds,
  ];

  const regSnaps = await Promise.all(regIds.map((id) => regsRef.doc(id).get()));
  const regMap = new Map<string, Registration>();
  for (const snap of regSnaps) {
    if (snap.exists) regMap.set(snap.id, snap.data() as Registration);
  }

  return {
    ...team,
    lead: team.leadRegistrationId ? regMap.get(team.leadRegistrationId) ?? null : null,
    members: team.memberRegistrationIds
      .map((id) => regMap.get(id))
      .filter((r): r is Registration => Boolean(r)),
  };
}

export async function getUnassignedRegistrations(
  slug: string
): Promise<Registration[]> {
  await requireSession();
  const eventId = await resolveEventId(slug);

  const regsSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("registrations")
    .get();

  return regsSnap.docs
    .map((d) => d.data() as Registration)
    .filter((r) => !r.teamId || r.ticketCategory === "find_team");
}
