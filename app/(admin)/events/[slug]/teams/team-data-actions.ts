"use server";

import { adminDb } from "@/lib/firebase/admin";
import { hydrateRegistration } from "@/lib/registrations";
import { computeFormationStats } from "@/lib/team-resolver";
import { requireSession } from "@/lib/session";
import {
  Event,
  Registration,
  Team,
  TeamFormationStats,
  TeamWithMembers,
} from "@/lib/types";

async function resolveEventId(slug: string): Promise<string> {
  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");
  return eventSnap.docs[0].id;
}

async function resolveEvent(slug: string): Promise<Event> {
  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");
  const doc = eventSnap.docs[0];
  return { ...(doc.data() as Event), id: doc.id };
}

export interface TeamsPageData {
  eventId: string;
  event: Event;
  teams: Team[];
  registrations: Registration[];
  stats: TeamFormationStats & { totalRegistrations: number };
}

export async function getTeamsPageData(slug: string): Promise<TeamsPageData> {
  await requireSession();
  const event = await resolveEvent(slug);
  const eventId = event.id;

  const [teamsSnap, regsSnap] = await Promise.all([
    adminDb.collection("events").doc(eventId).collection("teams").get(),
    adminDb.collection("events").doc(eventId).collection("registrations").get(),
  ]);

  const teams = teamsSnap.docs.map((d) => d.data() as Team);
  const registrations = regsSnap.docs.map((d) => hydrateRegistration(d.data() as Registration));
  const poolIds = new Set(
    registrations.filter((r) => r.inPool && !r.teamId).map((r) => r.id)
  );
  const formationStats = computeFormationStats(teams, registrations, poolIds);

  return {
    eventId,
    event,
    teams,
    registrations,
    stats: {
      ...formationStats,
      totalRegistrations: registrations.length,
    },
  };
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
    if (snap.exists) regMap.set(snap.id, hydrateRegistration(snap.data() as Registration));
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
    .map((d) => hydrateRegistration(d.data() as Registration))
    .filter((r) => r.inPool || !r.teamId);
}
