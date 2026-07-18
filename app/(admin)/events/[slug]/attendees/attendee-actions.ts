"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { Attendee } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function toggleAttendeeBlacklist(
  eventId: string,
  attendeeId: string,
  blacklisted: boolean,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  try {
    const snap = await attendeeRef.get();
    if (!snap.exists) return { success: false, error: "Attendee not found." };

    const attendee = snap.data() as Attendee;
    if (blacklisted && attendee.claimedAny) {
      return {
        success: false,
        error: "Cannot blacklist an attendee who has already claimed their offers.",
      };
    }

    await attendeeRef.update({ isBlacklisted: blacklisted });

    await writeAuditLog({
      eventId,
      action: blacklisted ? "attendee_blacklisted" : "attendee_unblacklisted",
      metadata: { attendeeId, email: attendee.email },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/attendees`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Update failed.",
    };
  }
}
