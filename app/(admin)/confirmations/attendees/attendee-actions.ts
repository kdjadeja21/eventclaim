"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import { ConfirmationAttendee, ConfirmationStatus } from "@/lib/confirmation/types";
import { revalidatePath } from "next/cache";

export async function updateAttendeeStatusAdmin(
  attendeeId: string,
  status: ConfirmationStatus,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
    const ref = adminDb.collection("confirmationAttendees").doc(attendeeId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: "Attendee not found." };

    await ref.update({
      status,
      statusUpdatedAt: new Date().toISOString(),
      ...(notes !== undefined ? { notes } : {}),
    });

    await writeConfirmationAuditLog({
      action: "attendee_status_updated",
      actorType: "admin",
      actorId: session.uid,
      attendeeId,
      metadata: { status, source: "admin_override" },
    });

    revalidatePath("/confirmations/attendees");
    revalidatePath("/confirmations");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update status.",
    };
  }
}

export async function reassignAttendeeAdmin(
  attendeeId: string,
  volunteerId: string | null
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
    const attendeeRef = adminDb.collection("confirmationAttendees").doc(attendeeId);
    const attendeeSnap = await attendeeRef.get();
    if (!attendeeSnap.exists) return { success: false, error: "Attendee not found." };

    let volunteerName: string | null = null;
    if (volunteerId) {
      const volunteerSnap = await adminDb
        .collection("confirmationVolunteers")
        .doc(volunteerId)
        .get();
      if (!volunteerSnap.exists) {
        return { success: false, error: "Volunteer not found." };
      }
      volunteerName = volunteerSnap.data()!.name as string;
    }

    const attendee = attendeeSnap.data() as ConfirmationAttendee;

    await attendeeRef.update({
      assignedVolunteerId: volunteerId,
      assignedVolunteerName: volunteerName,
      assignedAt: volunteerId ? new Date().toISOString() : null,
      status:
        volunteerId && attendee.status === "need_confirmation"
          ? "call_pending"
          : attendee.status,
    });

    await writeConfirmationAuditLog({
      action: "attendees_assigned",
      actorType: "admin",
      actorId: session.uid,
      attendeeId,
      volunteerId: volunteerId ?? undefined,
      metadata: { source: "admin_manual_reassign", volunteerId },
    });

    revalidatePath("/confirmations/attendees");
    revalidatePath("/confirmations");
    revalidatePath("/confirmations/volunteers");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to reassign attendee.",
    };
  }
}
