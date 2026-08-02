"use server";

import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { getAttendeeById, setAttendeeBlacklisted } from "@/lib/db/repos/attendees";

export async function toggleAttendeeBlacklist(
  eventId: string,
  attendeeId: string,
  blacklisted: boolean,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
    const attendee = await getAttendeeById(eventId, attendeeId);
    if (!attendee) return { success: false, error: "Attendee not found." };

    if (blacklisted && attendee.claimedAny) {
      return {
        success: false,
        error: "Cannot blacklist an attendee who has already claimed their offers.",
      };
    }

    await setAttendeeBlacklisted(eventId, attendeeId, blacklisted);

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
