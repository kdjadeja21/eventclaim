"use server";

import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmail } from "@/lib/utils";
import {
  getFriendlyFirestoreMessage,
  isFirestoreUnavailable,
} from "@/lib/firestore-errors";
import { Attendee, Event } from "@/lib/types";

export async function checkAttendeeStatus(email: string): Promise<{
  found: boolean;
  eventName?: string;
  eventDate?: string;
  emailSent?: boolean;
  emailSentAt?: string | null;
  claimed?: boolean;
  grantCount?: number;
  isBlacklisted?: boolean;
}> {
  const normalizedEmail = normalizeEmail(email);

  try {
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

      // Best-effort audit; never let a logging failure break the status check.
      try {
        await writeAuditLog({
          eventId: eventDoc.id,
          action: "status_checked",
          metadata: { email: normalizedEmail },
        });
      } catch {
        // ignore
      }

      return {
        found: true,
        eventName: event.name,
        eventDate: event.date,
        emailSent: attendee.emailStatus === "sent",
        emailSentAt: attendee.emailSentAt,
        claimed: attendee.claimedAny,
        grantCount: attendee.grantCount ?? 0,
        isBlacklisted: attendee.isBlacklisted ?? false,
      };
    }

    return { found: false };
  } catch (err) {
    // Surface a friendly, quota-aware message to the client (which shows it
    // inline) instead of leaking the raw gRPC error.
    if (isFirestoreUnavailable(err)) {
      throw new Error(getFriendlyFirestoreMessage(err));
    }
    throw err;
  }
}
