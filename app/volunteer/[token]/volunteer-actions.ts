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
  status: ConfirmationStatus;
  teamRole: ConfirmationAttendee["teamRole"];
  assignedVolunteerName: string | null;
}

/**
 * Teammates of the given (already-authorized) attendee, matched by teamKey —
 * regardless of which volunteer they're assigned to — so a caller can see
 * whether someone's teammate is already confirmed/called, even across
 * volunteers. Only minimal fields are exposed (no email/phone/notes).
 */
export async function getTeammates(
  token: string,
  attendeeId: string
): Promise<Teammate[]> {
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
      status: a.status,
      teamRole: a.teamRole,
      assignedVolunteerName: a.assignedVolunteerName,
    }));
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
      attendeeId,
      volunteerId: volunteer.id,
      metadata: { status },
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
