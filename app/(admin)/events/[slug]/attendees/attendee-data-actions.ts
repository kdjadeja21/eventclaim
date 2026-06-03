"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { Attendee } from "@/lib/types";

export async function getAttendees(slug: string): Promise<{ attendees: Attendee[]; eventId: string }> {
  await requireSession();

  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");

  const eventId = eventSnap.docs[0].id;

  const attendeesSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .orderBy("createdAt", "desc")
    .get();

  return {
    attendees: attendeesSnap.docs.map((d) => d.data() as Attendee),
    eventId,
  };
}

export async function getAttendeeDetail(
  eventId: string,
  attendeeId: string
): Promise<{
  attendee: Attendee;
  emailLogs: Array<{
    id: string;
    emailType: string;
    sentAt: string;
    status: string;
  }>;
}> {
  await requireSession();

  const [attendeeSnap, logsSnap] = await Promise.all([
    adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .doc(attendeeId)
      .get(),
    adminDb
      .collection("emailLogs")
      .where("attendeeId", "==", attendeeId)
      .orderBy("sentAt", "desc")
      .limit(20)
      .get(),
  ]);

  if (!attendeeSnap.exists) throw new Error("Attendee not found");

  return {
    attendee: attendeeSnap.data() as Attendee,
    emailLogs: logsSnap.docs.map((d) => ({
      id: d.id,
      emailType: d.data().emailType,
      sentAt: d.data().sentAt,
      status: d.data().status,
    })),
  };
}
