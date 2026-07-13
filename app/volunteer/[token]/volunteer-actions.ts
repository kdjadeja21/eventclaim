"use server";

import { adminDb } from "@/lib/firebase/admin";
import {
  getVolunteerByToken,
  verifyVolunteerPin as verifyVolunteerPinLib,
  VerifyPinResult,
} from "@/lib/confirmation/volunteer-auth";
import {
  clearVolunteerSession,
  getVolunteerSession,
} from "@/lib/confirmation/volunteer-session";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import { ConfirmationAttendee, ConfirmationStatus } from "@/lib/confirmation/types";
import { revalidatePath } from "next/cache";

export async function verifyVolunteerPin(
  token: string,
  pin: string
): Promise<VerifyPinResult> {
  return verifyVolunteerPinLib(token, pin);
}

export async function logoutVolunteer(): Promise<void> {
  await clearVolunteerSession();
}

/**
 * Re-validates that the session cookie's volunteerId matches the resolved
 * token's volunteer, so a volunteer can only ever see/edit their own
 * assigned attendees.
 */
async function requireVolunteerForToken(token: string) {
  const volunteer = await getVolunteerByToken(token);
  if (!volunteer || !volunteer.isActive) {
    throw new Error("Invalid or inactive volunteer link.");
  }

  const session = await getVolunteerSession();
  if (!session || session.volunteerId !== volunteer.id) {
    throw new Error("UNAUTHORIZED");
  }

  return volunteer;
}

export async function getVolunteerAttendees(
  token: string
): Promise<ConfirmationAttendee[]> {
  const volunteer = await requireVolunteerForToken(token);

  const snap = await adminDb
    .collection("confirmationAttendees")
    .where("assignedVolunteerId", "==", volunteer.id)
    .get();

  return snap.docs.map((d) => d.data() as ConfirmationAttendee);
}

export async function getVolunteerAttendee(
  token: string,
  attendeeId: string
): Promise<ConfirmationAttendee | null> {
  const volunteer = await requireVolunteerForToken(token);

  const snap = await adminDb.collection("confirmationAttendees").doc(attendeeId).get();
  if (!snap.exists) return null;

  const attendee = snap.data() as ConfirmationAttendee;
  if (attendee.assignedVolunteerId !== volunteer.id) return null;

  return attendee;
}

export interface Teammate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: ConfirmationStatus;
  teamRole: ConfirmationAttendee["teamRole"];
  assignedVolunteerId: string | null;
  assignedVolunteerName: string | null;
  notes?: string;
  /** True when this teammate is on the current volunteer's queue. */
  canUpdate: boolean;
}

/**
 * Full team roster for the given attendee (matched by teamKey). Contact
 * details are included so a volunteer can call the whole team in one pass.
 * `canUpdate` is true only for teammates assigned to this volunteer.
 */
export async function getTeammates(
  token: string,
  attendeeId: string
): Promise<Teammate[]> {
  const volunteer = await requireVolunteerForToken(token);
  const attendee = await getVolunteerAttendee(token, attendeeId);
  if (!attendee || !attendee.teamKey) return [];

  const snap = await adminDb
    .collection("confirmationAttendees")
    .where("teamKey", "==", attendee.teamKey)
    .get();

  return snap.docs
    .map((d) => d.data() as ConfirmationAttendee)
    .filter((a) => a.id !== attendeeId)
    .map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      phone: a.phone,
      status: a.status,
      teamRole: a.teamRole,
      assignedVolunteerId: a.assignedVolunteerId,
      assignedVolunteerName: a.assignedVolunteerName,
      notes: a.notes,
      canUpdate: a.assignedVolunteerId === volunteer.id,
    }));
}

/**
 * Every member of the team including the focus attendee, for the details
 * page "call the whole team" view.
 */
export async function getTeamRoster(
  token: string,
  attendeeId: string
): Promise<{ focus: ConfirmationAttendee; teammates: Teammate[] } | null> {
  const focus = await getVolunteerAttendee(token, attendeeId);
  if (!focus) return null;

  const teammates = await getTeammates(token, attendeeId);
  return { focus, teammates };
}

export async function updateAttendeeStatus(
  token: string,
  attendeeId: string,
  status: ConfirmationStatus,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const volunteer = await requireVolunteerForToken(token);

    const attendeeRef = adminDb.collection("confirmationAttendees").doc(attendeeId);
    const snap = await attendeeRef.get();
    if (!snap.exists) return { success: false, error: "Attendee not found." };

    const attendee = snap.data() as ConfirmationAttendee;
    if (attendee.assignedVolunteerId !== volunteer.id) {
      return { success: false, error: "This attendee isn't assigned to you." };
    }

    await attendeeRef.update({
      status,
      statusUpdatedAt: new Date().toISOString(),
      ...(notes !== undefined ? { notes } : {}),
    });

    await writeConfirmationAuditLog({
      action: "attendee_status_updated",
      actorType: "volunteer",
      actorId: volunteer.id,
      actorName: volunteer.name,
      actorUsername: volunteer.username,
      attendeeId,
      attendeeName: attendee.name,
      volunteerId: volunteer.id,
      metadata: { status, username: volunteer.username },
    });

    revalidatePath(`/volunteer/${token}`);
    revalidatePath(`/volunteer/${token}/${attendeeId}`);

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update status.",
    };
  }
}

/**
 * Apply the same status (and optional shared notes) to every teammate on this
 * volunteer's queue that shares the focus attendee's teamKey — plus the focus
 * attendee themselves. Lets a volunteer "call the entire team in one shot."
 */
export async function updateTeamStatus(
  token: string,
  focusAttendeeId: string,
  status: ConfirmationStatus,
  notes?: string
): Promise<{ success: boolean; updated: number; error?: string }> {
  try {
    const volunteer = await requireVolunteerForToken(token);

    const focusRef = adminDb.collection("confirmationAttendees").doc(focusAttendeeId);
    const focusSnap = await focusRef.get();
    if (!focusSnap.exists) {
      return { success: false, updated: 0, error: "Attendee not found." };
    }

    const focus = focusSnap.data() as ConfirmationAttendee;
    if (focus.assignedVolunteerId !== volunteer.id) {
      return {
        success: false,
        updated: 0,
        error: "This attendee isn't assigned to you.",
      };
    }

    const targets: ConfirmationAttendee[] = [focus];

    if (focus.teamKey) {
      const teamSnap = await adminDb
        .collection("confirmationAttendees")
        .where("teamKey", "==", focus.teamKey)
        .get();

      for (const doc of teamSnap.docs) {
        const member = doc.data() as ConfirmationAttendee;
        if (member.id === focus.id) continue;
        if (member.assignedVolunteerId !== volunteer.id) continue;
        targets.push(member);
      }
    }

    const now = new Date().toISOString();
    const batch = adminDb.batch();

    for (const member of targets) {
      batch.update(adminDb.collection("confirmationAttendees").doc(member.id), {
        status,
        statusUpdatedAt: now,
        ...(notes !== undefined ? { notes } : {}),
      });
    }

    await batch.commit();

    for (const member of targets) {
      await writeConfirmationAuditLog({
        action: "attendee_status_updated",
        actorType: "volunteer",
        actorId: volunteer.id,
        actorName: volunteer.name,
        actorUsername: volunteer.username,
        attendeeId: member.id,
        attendeeName: member.name,
        volunteerId: volunteer.id,
        metadata: {
          status,
          username: volunteer.username,
          teamBulkUpdate: true,
          teamKey: focus.teamKey ?? null,
        },
      });
    }

    revalidatePath(`/volunteer/${token}`);
    revalidatePath(`/volunteer/${token}/${focusAttendeeId}`);

    return { success: true, updated: targets.length };
  } catch (err) {
    return {
      success: false,
      updated: 0,
      error: err instanceof Error ? err.message : "Failed to update team status.",
    };
  }
}
