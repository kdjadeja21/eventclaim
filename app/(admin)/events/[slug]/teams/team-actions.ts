"use server";

import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { attendeeDocId } from "@/lib/import";
import { fetchAllLumaGuests, FetchAllGuestsParams } from "@/lib/luma";
import { lumaGuestToRegistration, registrationDocId } from "@/lib/registrations";
import { applyTeamBuild, newManualTeamId } from "@/lib/team-mapping";
import { requireSession } from "@/lib/session";
import { Registration, Team, TeamStatus } from "@/lib/types";
import { normalizeEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function resolveEvent(slug: string): Promise<{ eventId: string; slug: string }> {
  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");
  return { eventId: eventSnap.docs[0].id, slug };
}

export interface SyncRegistrationsResult {
  syncedCount: number;
  totalFetched: number;
  teamsCreated: number;
  teamsUpdated: number;
  registrationsLinked: number;
  syncedAt: string;
  error?: string;
}

export async function syncLumaRegistrations(
  slug: string,
  lumaParams: FetchAllGuestsParams
): Promise<SyncRegistrationsResult> {
  const session = await requireSession();

  let eventId: string;
  try {
    ({ eventId } = await resolveEvent(slug));
  } catch {
    return emptySyncResult("Event not found.");
  }

  let guests;
  try {
    guests = await fetchAllLumaGuests(lumaParams);
  } catch (err) {
    return emptySyncResult(err instanceof Error ? err.message : "Luma API request failed.");
  }

  const eventRef = adminDb.collection("events").doc(eventId);
  const regsRef = eventRef.collection("registrations");
  const attendeesRef = eventRef.collection("attendees");
  const syncedAt = new Date().toISOString();

  let syncedCount = 0;

  for (const guest of guests) {
    const email = normalizeEmail(guest.user_email ?? "");
    if (!email || !z.string().email().safeParse(email).success) continue;

    const regId = registrationDocId(eventId, guest.id, email);
    const existingSnap = await regsRef.doc(regId).get();
    const existing = existingSnap.exists ? (existingSnap.data() as Registration) : undefined;

    const attendeeId = attendeeDocId(eventId, email);
    const attendeeSnap = await attendeesRef.doc(attendeeId).get();

    const registration = lumaGuestToRegistration(guest, eventId, {
      ...existing,
      attendeeId: attendeeSnap.exists ? attendeeId : existing?.attendeeId ?? null,
      teamId: existing?.teamId ?? null,
      isManualMapping: existing?.isManualMapping ?? false,
    });

    await regsRef.doc(registration.id).set(registration, { merge: true });
    syncedCount++;
  }

  const [allRegsSnap, allTeamsSnap] = await Promise.all([
    regsRef.get(),
    eventRef.collection("teams").get(),
  ]);

  const registrations = allRegsSnap.docs.map((d) => d.data() as Registration);
  const existingTeams = allTeamsSnap.docs.map((d) => d.data() as Team);

  const buildResult = await applyTeamBuild(eventId, registrations, existingTeams);

  await eventRef.update({
    lumaEventId: lumaParams.event_id,
    lumaLastSyncedAt: syncedAt,
    updatedAt: syncedAt,
  });

  await writeAuditLog({
    eventId,
    action: "registrations_luma_synced",
    metadata: {
      lumaEventId: lumaParams.event_id,
      totalFetched: guests.length,
      syncedCount,
      ...buildResult,
    },
    userId: session.uid,
  });

  await writeAuditLog({
    eventId,
    action: "teams_auto_built",
    metadata: { ...buildResult },
    userId: session.uid,
  });

  revalidatePath(`/events/${slug}/teams`);

  return {
    syncedCount,
    totalFetched: guests.length,
    teamsCreated: buildResult.teamsCreated,
    teamsUpdated: buildResult.teamsUpdated,
    registrationsLinked: buildResult.registrationsLinked,
    syncedAt,
  };
}

function emptySyncResult(error: string): SyncRegistrationsResult {
  return {
    syncedCount: 0,
    totalFetched: 0,
    teamsCreated: 0,
    teamsUpdated: 0,
    registrationsLinked: 0,
    syncedAt: "",
    error,
  };
}

const assignMemberSchema = z.object({
  slug: z.string().min(1),
  teamId: z.string().min(1),
  registrationId: z.string().min(1),
});

export async function assignMemberToTeam(
  slug: string,
  teamId: string,
  registrationId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const parsed = assignMemberSchema.safeParse({ slug, teamId, registrationId });
  if (!parsed.success) return { success: false, error: "Invalid input." };

  const { eventId } = await resolveEvent(slug);
  const eventRef = adminDb.collection("events").doc(eventId);
  const now = new Date().toISOString();

  try {
    await adminDb.runTransaction(async (tx) => {
      const teamRef = eventRef.collection("teams").doc(teamId);
      const regRef = eventRef.collection("registrations").doc(registrationId);

      const [teamSnap, regSnap] = await Promise.all([tx.get(teamRef), tx.get(regRef)]);
      if (!teamSnap.exists) throw new Error("Team not found.");
      if (!regSnap.exists) throw new Error("Registration not found.");

      const team = teamSnap.data() as Team;
      const reg = regSnap.data() as Registration;

      if (reg.teamId && reg.teamId !== teamId) {
        const oldTeamRef = eventRef.collection("teams").doc(reg.teamId);
        const oldTeamSnap = await tx.get(oldTeamRef);
        if (oldTeamSnap.exists) {
          const oldTeam = oldTeamSnap.data() as Team;
          tx.update(oldTeamRef, {
            memberRegistrationIds: oldTeam.memberRegistrationIds.filter((id) => id !== registrationId),
            memberEmails: oldTeam.memberEmails.filter((e) => e !== reg.email),
            updatedAt: now,
          });
        }
      }

      const memberIds = team.memberRegistrationIds.includes(registrationId)
        ? team.memberRegistrationIds
        : [...team.memberRegistrationIds, registrationId];
      const memberEmails = team.memberEmails.includes(reg.email)
        ? team.memberEmails
        : [...team.memberEmails, reg.email];

      tx.update(teamRef, {
        memberRegistrationIds: memberIds,
        memberEmails,
        source: "manual",
        status: "manual" satisfies TeamStatus,
        updatedAt: now,
      });

      tx.update(regRef, {
        teamId,
        isManualMapping: true,
        updatedAt: now,
      });
    });

    await writeAuditLog({
      eventId,
      action: "team_member_assigned",
      metadata: { teamId, registrationId },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to assign member.",
    };
  }
}

const removeMemberSchema = z.object({
  slug: z.string().min(1),
  teamId: z.string().min(1),
  registrationId: z.string().min(1),
});

export async function removeMemberFromTeam(
  slug: string,
  teamId: string,
  registrationId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const parsed = removeMemberSchema.safeParse({ slug, teamId, registrationId });
  if (!parsed.success) return { success: false, error: "Invalid input." };

  const { eventId } = await resolveEvent(slug);
  const eventRef = adminDb.collection("events").doc(eventId);
  const now = new Date().toISOString();

  try {
    await adminDb.runTransaction(async (tx) => {
      const teamRef = eventRef.collection("teams").doc(teamId);
      const regRef = eventRef.collection("registrations").doc(registrationId);

      const [teamSnap, regSnap] = await Promise.all([tx.get(teamRef), tx.get(regRef)]);
      if (!teamSnap.exists) throw new Error("Team not found.");
      if (!regSnap.exists) throw new Error("Registration not found.");

      const team = teamSnap.data() as Team;
      const reg = regSnap.data() as Registration;

      if (team.leadRegistrationId === registrationId) {
        throw new Error("Cannot remove team lead. Reassign lead first.");
      }

      tx.update(teamRef, {
        memberRegistrationIds: team.memberRegistrationIds.filter((id) => id !== registrationId),
        memberEmails: team.memberEmails.filter((e) => e !== reg.email),
        source: "manual",
        status: "manual",
        updatedAt: now,
      });

      tx.update(regRef, {
        teamId: null,
        isManualMapping: true,
        updatedAt: now,
      });
    });

    await writeAuditLog({
      eventId,
      action: "team_member_removed",
      metadata: { teamId, registrationId },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to remove member.",
    };
  }
}

const createTeamSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  leadRegistrationId: z.string().min(1),
  memberRegistrationIds: z.array(z.string()).optional(),
});

export async function createManualTeam(
  slug: string,
  name: string,
  leadRegistrationId: string,
  memberRegistrationIds: string[] = []
): Promise<{ success: boolean; teamId?: string; error?: string }> {
  const session = await requireSession();
  const parsed = createTeamSchema.safeParse({ slug, name, leadRegistrationId, memberRegistrationIds });
  if (!parsed.success) return { success: false, error: "Invalid input." };

  const { eventId } = await resolveEvent(slug);
  const eventRef = adminDb.collection("events").doc(eventId);
  const teamId = newManualTeamId();
  const now = new Date().toISOString();

  try {
    const leadSnap = await eventRef.collection("registrations").doc(leadRegistrationId).get();
    if (!leadSnap.exists) return { success: false, error: "Lead registration not found." };
    const lead = leadSnap.data() as Registration;

    const memberRegs: Registration[] = [];
    for (const mid of memberRegistrationIds) {
      const snap = await eventRef.collection("registrations").doc(mid).get();
      if (snap.exists) memberRegs.push(snap.data() as Registration);
    }

    const team: Team = {
      id: teamId,
      eventId,
      name: name.trim(),
      leadRegistrationId,
      leadEmail: lead.email,
      memberRegistrationIds: memberRegs.map((r) => r.id),
      memberEmails: memberRegs.map((r) => r.email),
      expectedMemberEmails: [],
      ticketCategory: lead.ticketCategory,
      status: "manual",
      source: "manual",
      issues: [],
      createdAt: now,
      updatedAt: now,
    };

    const batch = adminDb.batch();
    batch.set(eventRef.collection("teams").doc(teamId), team);

    batch.update(eventRef.collection("registrations").doc(leadRegistrationId), {
      teamId,
      isManualMapping: true,
      updatedAt: now,
    });

    for (const member of memberRegs) {
      batch.update(eventRef.collection("registrations").doc(member.id), {
        teamId,
        isManualMapping: true,
        updatedAt: now,
      });
    }

    await batch.commit();

    await writeAuditLog({
      eventId,
      action: "team_created",
      metadata: { teamId, name, leadRegistrationId, memberRegistrationIds },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true, teamId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create team.",
    };
  }
}

export async function deleteTeam(
  slug: string,
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const { eventId } = await resolveEvent(slug);
  const eventRef = adminDb.collection("events").doc(eventId);
  const now = new Date().toISOString();

  try {
    const teamSnap = await eventRef.collection("teams").doc(teamId).get();
    if (!teamSnap.exists) return { success: false, error: "Team not found." };
    const team = teamSnap.data() as Team;

    const linkedIds = [
      ...(team.leadRegistrationId ? [team.leadRegistrationId] : []),
      ...team.memberRegistrationIds,
    ];

    const batch = adminDb.batch();
    batch.delete(eventRef.collection("teams").doc(teamId));

    for (const regId of linkedIds) {
      batch.update(eventRef.collection("registrations").doc(regId), {
        teamId: null,
        updatedAt: now,
      });
    }

    await batch.commit();

    await writeAuditLog({
      eventId,
      action: "team_deleted",
      metadata: { teamId, name: team.name },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete team.",
    };
  }
}

export async function markTeamComplete(
  slug: string,
  teamId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const { eventId } = await resolveEvent(slug);
  const now = new Date().toISOString();

  try {
    await adminDb
      .collection("events")
      .doc(eventId)
      .collection("teams")
      .doc(teamId)
      .update({
        status: "complete",
        issues: [],
        source: "manual",
        updatedAt: now,
      });

    await writeAuditLog({
      eventId,
      action: "team_updated",
      metadata: { teamId, action: "mark_complete" },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update team.",
    };
  }
}

export async function rebuildTeams(
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const { eventId } = await resolveEvent(slug);

  try {
    const eventRef = adminDb.collection("events").doc(eventId);
    const [regsSnap, teamsSnap] = await Promise.all([
      eventRef.collection("registrations").get(),
      eventRef.collection("teams").get(),
    ]);

    const registrations = regsSnap.docs.map((d) => d.data() as Registration);
    const existingTeams = teamsSnap.docs.map((d) => d.data() as Team);
    const result = await applyTeamBuild(eventId, registrations, existingTeams);

    await writeAuditLog({
      eventId,
      action: "teams_auto_built",
      metadata: { ...result },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to rebuild teams.",
    };
  }
}
