"use server";

import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { attendeeDocId } from "@/lib/import";
import { fetchAllLumaGuests, fetchLumaGuestsPage, FetchAllGuestsParams, LumaGuest } from "@/lib/luma";
import {
  DEFAULT_TICKET_TYPE_MAP,
  lumaGuestToRegistration,
  registrationDocId,
  TEAM_QUESTION_ID,
} from "@/lib/registrations";
import { applyTeamBuild, newManualTeamId } from "@/lib/team-mapping";
import { requireSession } from "@/lib/session";
import { Event, Registration, Team, TeamIssue, TeamLink, TeamStatus } from "@/lib/types";
import { normalizeEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { z } from "zod";

interface EventContext {
  eventId: string;
  slug: string;
  event: Event;
}

async function resolveEvent(slug: string): Promise<EventContext> {
  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");
  const doc = eventSnap.docs[0];
  const event = { ...(doc.data() as Event), id: doc.id };
  return { eventId: doc.id, slug, event };
}

function registrationParseOptions(event: Event) {
  return {
    ticketTypeMap: event.ticketTypeMap ?? DEFAULT_TICKET_TYPE_MAP,
    teamQuestionId: event.teamQuestionId ?? TEAM_QUESTION_ID,
  };
}

async function rebuildTeamsForEvent(ctx: EventContext) {
  const eventRef = adminDb.collection("events").doc(ctx.eventId);
  const [regsSnap, teamsSnap] = await Promise.all([
    eventRef.collection("registrations").get(),
    eventRef.collection("teams").get(),
  ]);
  const registrations = regsSnap.docs.map((d) => d.data() as Registration);
  const existingTeams = teamsSnap.docs.map((d) => d.data() as Team);
  return applyTeamBuild(ctx.eventId, registrations, existingTeams, ctx.event);
}

async function deleteCollectionInBatches(
  collectionRef: FirebaseFirestore.CollectionReference
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const snap = await collectionRef.limit(500).get();
    if (snap.empty) break;
    const batch = adminDb.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 500) break;
  }
  return deleted;
}

const FIRESTORE_BATCH_LIMIT = 450;

async function upsertGuestsToFirestore(
  ctx: EventContext,
  guests: LumaGuest[],
  attendeeEmailSet: Set<string>
): Promise<{ saved: number; skipped: number }> {
  const eventRef = adminDb.collection("events").doc(ctx.eventId);
  const regsRef = eventRef.collection("registrations");
  const parseOptions = registrationParseOptions(ctx.event);

  const validGuests: { guest: LumaGuest; email: string; regId: string }[] = [];
  let skipped = 0;

  for (const guest of guests) {
    const email = normalizeEmail(guest.user_email ?? "");
    if (!email || !z.string().email().safeParse(email).success) {
      skipped++;
      continue;
    }
    validGuests.push({
      guest,
      email,
      regId: registrationDocId(ctx.eventId, guest.id, email),
    });
  }

  if (validGuests.length === 0) return { saved: 0, skipped };

  const existingSnaps = await adminDb.getAll(
    ...validGuests.map(({ regId }) => regsRef.doc(regId))
  );
  const existingById = new Map(
    existingSnaps.filter((s) => s.exists).map((s) => [s.id, s.data() as Registration])
  );

  let saved = 0;
  for (let i = 0; i < validGuests.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = validGuests.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = adminDb.batch();

    for (const { guest, email, regId } of chunk) {
      const existing = existingById.get(regId);
      const attendeeId = attendeeDocId(ctx.eventId, email);
      const registration = lumaGuestToRegistration(guest, ctx.eventId, {
        ...existing,
        attendeeId: attendeeEmailSet.has(email)
          ? attendeeId
          : existing?.attendeeId ?? null,
        teamId: existing?.teamId ?? null,
        isManualMapping: existing?.isManualMapping ?? false,
      }, parseOptions);
      batch.set(regsRef.doc(registration.id), registration, { merge: true });
      saved++;
    }

    await batch.commit();
  }

  return { saved, skipped };
}

export interface SyncPrepResult {
  attendeeEmails: string[];
  error?: string;
}

/** Load attendee emails once before chunked sync. */
export async function getSyncPrepData(slug: string): Promise<SyncPrepResult> {
  await requireSession();
  try {
    const { eventId } = await resolveEvent(slug);
    const snap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .get();
    return {
      attendeeEmails: snap.docs.map((d) => normalizeEmail((d.data() as { email: string }).email)),
    };
  } catch (err) {
    return {
      attendeeEmails: [],
      error: err instanceof Error ? err.message : "Failed to prepare sync.",
    };
  }
}

export interface UpsertBatchResult {
  saved: number;
  skipped: number;
  error?: string;
}

export async function upsertRegistrationBatch(
  slug: string,
  guests: LumaGuest[],
  attendeeEmails: string[]
): Promise<UpsertBatchResult> {
  await requireSession();
  try {
    const ctx = await resolveEvent(slug);
    const attendeeEmailSet = new Set(attendeeEmails.map(normalizeEmail));
    const result = await upsertGuestsToFirestore(ctx, guests, attendeeEmailSet);
    return result;
  } catch (err) {
    return {
      saved: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : "Failed to save batch.",
    };
  }
}

export interface FinalizeSyncResult {
  teamsCreated: number;
  teamsUpdated: number;
  registrationsLinked: number;
  syncedAt: string;
  error?: string;
}

export async function finalizeLumaSync(
  slug: string,
  lumaEventId: string,
  totalFetched: number,
  syncedCount: number
): Promise<FinalizeSyncResult> {
  const session = await requireSession();
  const syncedAt = new Date().toISOString();

  try {
    const ctx = await resolveEvent(slug);
    const eventRef = adminDb.collection("events").doc(ctx.eventId);

    const [allRegsSnap, allTeamsSnap] = await Promise.all([
      eventRef.collection("registrations").get(),
      eventRef.collection("teams").get(),
    ]);

    const registrations = allRegsSnap.docs.map((d) => d.data() as Registration);
    const existingTeams = allTeamsSnap.docs.map((d) => d.data() as Team);
    const buildResult = await applyTeamBuild(
      ctx.eventId,
      registrations,
      existingTeams,
      ctx.event
    );

    await eventRef.update({
      lumaEventId,
      lumaLastSyncedAt: syncedAt,
      updatedAt: syncedAt,
    });

    await writeAuditLog({
      eventId: ctx.eventId,
      action: "registrations_luma_synced",
      metadata: {
        lumaEventId,
        totalFetched,
        syncedCount,
        ...buildResult,
      },
      userId: session.uid,
    });

    await writeAuditLog({
      eventId: ctx.eventId,
      action: "teams_auto_built",
      metadata: { ...buildResult },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);

    return {
      ...buildResult,
      syncedAt,
    };
  } catch (err) {
    return {
      teamsCreated: 0,
      teamsUpdated: 0,
      registrationsLinked: 0,
      syncedAt: "",
      error: err instanceof Error ? err.message : "Failed to finalize sync.",
    };
  }
}

export interface DeleteAllTeamDataResult {
  success: boolean;
  deletedRegistrations: number;
  deletedTeams: number;
  error?: string;
}

export async function deleteAllTeamData(
  slug: string,
  confirmText: string
): Promise<DeleteAllTeamDataResult> {
  const session = await requireSession();
  if (confirmText !== "DELETE ALL") {
    return {
      success: false,
      deletedRegistrations: 0,
      deletedTeams: 0,
      error: 'Type "DELETE ALL" to confirm.',
    };
  }

  try {
    const { eventId } = await resolveEvent(slug);
    const eventRef = adminDb.collection("events").doc(eventId);

    const deletedTeams = await deleteCollectionInBatches(eventRef.collection("teams"));
    const deletedRegistrations = await deleteCollectionInBatches(
      eventRef.collection("registrations")
    );

    await eventRef.update({
      lumaLastSyncedAt: null,
      updatedAt: new Date().toISOString(),
    });

    await writeAuditLog({
      eventId,
      action: "teams_data_cleared",
      metadata: { deletedRegistrations, deletedTeams },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true, deletedRegistrations, deletedTeams };
  } catch (err) {
    return {
      success: false,
      deletedRegistrations: 0,
      deletedTeams: 0,
      error: err instanceof Error ? err.message : "Failed to delete records.",
    };
  }
}

export async function fetchLumaGuestsPageForSync(
  params: FetchAllGuestsParams & { pagination_cursor?: string }
): Promise<{
  entries: LumaGuest[];
  has_more: boolean;
  next_cursor?: string;
  error?: string;
}> {
  await requireSession();
  try {
    return await fetchLumaGuestsPage({
      ...params,
      pagination_cursor: params.pagination_cursor,
      pagination_limit: 50,
    });
  } catch (err) {
    return {
      entries: [],
      has_more: false,
      error: err instanceof Error ? err.message : "Luma fetch failed.",
    };
  }
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

  let ctx: EventContext;
  try {
    ctx = await resolveEvent(slug);
  } catch {
    return emptySyncResult("Event not found.");
  }

  let guests;
  try {
    guests = await fetchAllLumaGuests(lumaParams);
  } catch (err) {
    return emptySyncResult(err instanceof Error ? err.message : "Luma API request failed.");
  }

  const prep = await getSyncPrepData(slug);
  if (prep.error) return emptySyncResult(prep.error);

  const attendeeEmailSet = new Set(prep.attendeeEmails.map(normalizeEmail));
  const { saved: syncedCount, skipped: invalid } = await upsertGuestsToFirestore(
    ctx,
    guests,
    attendeeEmailSet
  );

  const eventRef = adminDb.collection("events").doc(ctx.eventId);
  const syncedAt = new Date().toISOString();

  const [allRegsSnap, allTeamsSnap] = await Promise.all([
    eventRef.collection("registrations").get(),
    eventRef.collection("teams").get(),
  ]);

  const registrations = allRegsSnap.docs.map((d) => d.data() as Registration);
  const existingTeams = allTeamsSnap.docs.map((d) => d.data() as Team);

  const buildResult = await applyTeamBuild(
    ctx.eventId,
    registrations,
    existingTeams,
    ctx.event
  );

  await eventRef.update({
    lumaEventId: lumaParams.event_id,
    lumaLastSyncedAt: syncedAt,
    updatedAt: syncedAt,
  });

  await writeAuditLog({
    eventId: ctx.eventId,
    action: "registrations_luma_synced",
    metadata: {
      lumaEventId: lumaParams.event_id,
      totalFetched: guests.length,
      syncedCount,
      invalid,
      ...buildResult,
    },
    userId: session.uid,
  });

  await writeAuditLog({
    eventId: ctx.eventId,
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
        inPool: false,
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
        inPool: true,
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

  try {
    const ctx = await resolveEvent(slug);
    const result = await rebuildTeamsForEvent(ctx);

    await writeAuditLog({
      eventId: ctx.eventId,
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

const fuzzyLinkSchema = z.object({
  slug: z.string().min(1),
  teamId: z.string().min(1),
  fromEmail: z.string().email(),
  toRegistrationId: z.string().min(1),
});

export async function acceptFuzzyLink(
  slug: string,
  teamId: string,
  fromEmail: string,
  toRegistrationId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const parsed = fuzzyLinkSchema.safeParse({ slug, teamId, fromEmail, toRegistrationId });
  if (!parsed.success) return { success: false, error: "Invalid input." };

  try {
    const ctx = await resolveEvent(slug);
    const eventRef = adminDb.collection("events").doc(ctx.eventId);
    const now = new Date().toISOString();
    const normalizedFrom = normalizeEmail(fromEmail);

    const regSnap = await eventRef.collection("registrations").doc(toRegistrationId).get();
    if (!regSnap.exists) return { success: false, error: "Target registration not found." };
    const targetReg = regSnap.data() as Registration;

    const link: TeamLink = {
      id: nanoid(),
      eventId: ctx.eventId,
      fromRegistrationId: teamId,
      toEmail: normalizedFrom,
      toRegistrationId,
      linkType: "confirmed_fuzzy",
      createdAt: now,
      createdBy: session.uid,
    };

    await eventRef.collection("teamLinks").doc(link.id).set(link);

    await writeAuditLog({
      eventId: ctx.eventId,
      action: "team_link_confirmed",
      metadata: { teamId, fromEmail: normalizedFrom, toRegistrationId, toEmail: targetReg.email },
      userId: session.uid,
    });

    await rebuildTeamsForEvent(ctx);
    revalidatePath(`/events/${slug}/teams`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to confirm link.",
    };
  }
}

export async function rejectFuzzyLink(
  slug: string,
  teamId: string,
  fromEmail: string,
  toRegistrationId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  const parsed = fuzzyLinkSchema.safeParse({ slug, teamId, fromEmail, toRegistrationId });
  if (!parsed.success) return { success: false, error: "Invalid input." };

  try {
    const ctx = await resolveEvent(slug);
    const eventRef = adminDb.collection("events").doc(ctx.eventId);
    const teamRef = eventRef.collection("teams").doc(teamId);
    const teamSnap = await teamRef.get();
    if (!teamSnap.exists) return { success: false, error: "Team not found." };

    const team = teamSnap.data() as Team;
    const normalizedFrom = normalizeEmail(fromEmail);
    const remainingLinks = (team.suggestedLinks ?? []).filter(
      (l) =>
        !(
          normalizeEmail(l.fromEmail) === normalizedFrom &&
          l.toRegistrationId === toRegistrationId
        )
    );

    const issues: TeamIssue[] = team.issues.filter((i) => i !== "fuzzy_match_pending");
    if (remainingLinks.length > 0) issues.push("fuzzy_match_pending");

    await teamRef.update({
      suggestedLinks: remainingLinks,
      issues,
      updatedAt: new Date().toISOString(),
    });

    await writeAuditLog({
      eventId: ctx.eventId,
      action: "team_link_rejected",
      metadata: { teamId, fromEmail: normalizedFrom, toRegistrationId },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reject suggestion.",
    };
  }
}

export async function moveRegistrationToPool(
  slug: string,
  registrationId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();
  try {
    const ctx = await resolveEvent(slug);
    const eventRef = adminDb.collection("events").doc(ctx.eventId);
    const now = new Date().toISOString();
    const regRef = eventRef.collection("registrations").doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists) return { success: false, error: "Registration not found." };
    const reg = regSnap.data() as Registration;

    if (reg.teamId) {
      const teamRef = eventRef.collection("teams").doc(reg.teamId);
      const teamSnap = await teamRef.get();
      if (teamSnap.exists) {
        const team = teamSnap.data() as Team;
        const updates: Partial<Team> = { updatedAt: now };
        if (team.leadRegistrationId === registrationId) {
          return { success: false, error: "Cannot move team lead to pool. Reassign lead first." };
        }
        updates.memberRegistrationIds = team.memberRegistrationIds.filter(
          (id) => id !== registrationId
        );
        updates.memberEmails = team.memberEmails.filter((e) => e !== reg.email);
        await teamRef.update(updates);
      }
    }

    await regRef.update({
      teamId: null,
      inPool: true,
      isManualMapping: true,
      updatedAt: now,
    });

    await writeAuditLog({
      eventId: ctx.eventId,
      action: "team_registration_pooled",
      metadata: { registrationId, email: reg.email },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/teams`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to move to pool.",
    };
  }
}

export async function bulkAssignToTeam(
  slug: string,
  teamId: string,
  registrationIds: string[]
): Promise<{ success: boolean; assigned: number; error?: string }> {
  let assigned = 0;
  for (const registrationId of registrationIds) {
    const result = await assignMemberToTeam(slug, teamId, registrationId);
    if (result.success) assigned++;
  }
  return { success: assigned > 0, assigned };
}

export async function updateEventTeamSettings(
  slug: string,
  data: {
    minSize: number;
    maxSize: number;
    allowOversized: boolean;
    teamQuestionId?: string;
    createTicketTypeId?: string;
    joinTicketTypeId?: string;
    findTicketTypeId?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  if (data.minSize < 1 || data.maxSize < data.minSize) {
    return { success: false, error: "Invalid team size rules." };
  }

  try {
    const ctx = await resolveEvent(slug);
    const ticketTypeMap = {
      create_team: [data.createTicketTypeId ?? DEFAULT_TICKET_TYPE_MAP.create_team![0]],
      join_team: [data.joinTicketTypeId ?? DEFAULT_TICKET_TYPE_MAP.join_team![0]],
      find_team: [data.findTicketTypeId ?? DEFAULT_TICKET_TYPE_MAP.find_team![0]],
    };

    await adminDb.collection("events").doc(ctx.eventId).update({
      teamRules: {
        minSize: data.minSize,
        maxSize: data.maxSize,
        allowOversized: data.allowOversized,
      },
      teamQuestionId: data.teamQuestionId?.trim() || TEAM_QUESTION_ID,
      ticketTypeMap,
      updatedAt: new Date().toISOString(),
    });

    await writeAuditLog({
      eventId: ctx.eventId,
      action: "event_updated",
      metadata: { teamRules: data, ticketTypeMap },
      userId: session.uid,
    });

    await rebuildTeamsForEvent({ ...ctx, event: { ...ctx.event, teamRules: {
      minSize: data.minSize,
      maxSize: data.maxSize,
      allowOversized: data.allowOversized,
    }, teamQuestionId: data.teamQuestionId, ticketTypeMap } });

    revalidatePath(`/events/${slug}/teams`);
    revalidatePath(`/events/${slug}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update team settings.",
    };
  }
}
