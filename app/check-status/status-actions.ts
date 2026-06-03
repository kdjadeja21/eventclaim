"use server";

import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmail } from "@/lib/utils";
import { Attendee, Event } from "@/lib/types";

export async function checkAttendeeStatus(email: string): Promise<{
  found: boolean;
  eventName?: string;
  eventDate?: string;
  emailSent?: boolean;
  emailSentAt?: string | null;
  claimed?: boolean;
  claimedAt?: string | null;
}> {
  const normalizedEmail = normalizeEmail(email);

  // Search across all events for this email
  const eventsSnap = await adminDb
    .collection("events")
    .where("status", "!=", "draft")
    .orderBy("status")
    .orderBy("createdAt", "desc")
    .get();

  for (const eventDoc of eventsSnap.docs) {
    const event = eventDoc.data() as Event;
    const attendeesSnap = await adminDb
      .collection("events")
      .doc(eventDoc.id)
      .collection("attendees")
      .where("email", "==", normalizedEmail)
      .limit(1)
      .get();

    if (attendeesSnap.empty) continue;

    const attendee = attendeesSnap.docs[0].data() as Attendee;

    await writeAuditLog({
      eventId: eventDoc.id,
      action: "status_checked",
      metadata: { email: normalizedEmail },
    });

    return {
      found: true,
      eventName: event.name,
      eventDate: event.date,
      emailSent: attendee.emailStatus === "sent",
      emailSentAt: attendee.emailSentAt,
      claimed: attendee.claimed,
      claimedAt: attendee.claimedAt,
    };
  }

  return { found: false };
}
