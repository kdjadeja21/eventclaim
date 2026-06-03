"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { sendCouponEmail, sendPendingEmails, resendFailedEmails } from "@/lib/email";
import { Attendee } from "@/lib/types";
import { revalidatePath } from "next/cache";

async function getEventAndAttendee(eventId: string, attendeeId: string) {
  const [eventDoc, attendeeDoc] = await Promise.all([
    adminDb.collection("events").doc(eventId).get(),
    adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .doc(attendeeId)
      .get(),
  ]);
  if (!eventDoc.exists) throw new Error("Event not found");
  if (!attendeeDoc.exists) throw new Error("Attendee not found");
  return {
    event: eventDoc.data()!,
    attendee: attendeeDoc.data() as Attendee,
  };
}

export async function sendSingleEmail(
  eventId: string,
  attendeeId: string
): Promise<{ success: boolean; error?: string }> {
  console.log("[sendSingleEmail] start", { eventId, attendeeId });
  await requireSession();
  const { event, attendee } = await getEventAndAttendee(eventId, attendeeId);
  console.log("[sendSingleEmail] attendee fetched", {
    attendeeEmail: attendee.email,
    emailStatus: attendee.emailStatus,
    hasCoupon: !!attendee.couponId,
    hasClaimToken: !!attendee.claimToken,
    notionGuideUrl: event.notionGuideUrl || "(none)",
  });
  const result = await sendCouponEmail(attendee, event.notionGuideUrl || "", false);
  console.log("[sendSingleEmail] result", result);
  revalidatePath(`/events`);
  return result;
}

export async function resendSingleEmail(
  eventId: string,
  attendeeId: string
): Promise<{ success: boolean; error?: string }> {
  console.log("[resendSingleEmail] start", { eventId, attendeeId });
  await requireSession();
  const { event, attendee } = await getEventAndAttendee(eventId, attendeeId);
  console.log("[resendSingleEmail] attendee fetched", {
    attendeeEmail: attendee.email,
    emailStatus: attendee.emailStatus,
    hasCoupon: !!attendee.couponId,
    hasClaimToken: !!attendee.claimToken,
    notionGuideUrl: event.notionGuideUrl || "(none)",
  });
  const result = await sendCouponEmail(attendee, event.notionGuideUrl || "", true);
  console.log("[resendSingleEmail] result", result);
  revalidatePath(`/events`);
  return result;
}

export async function bulkSendPending(
  eventId: string
): Promise<{ sent: number; failed: number; skipped: number }> {
  console.log("[bulkSendPending] start", { eventId });
  await requireSession();
  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  if (!eventDoc.exists) throw new Error("Event not found");
  const result = await sendPendingEmails(eventId, eventDoc.data()!.notionGuideUrl || "");
  console.log("[bulkSendPending] result", result);
  revalidatePath(`/events`);
  return result;
}

export async function bulkResendFailed(
  eventId: string
): Promise<{ sent: number; failed: number }> {
  console.log("[bulkResendFailed] start", { eventId });
  await requireSession();
  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  if (!eventDoc.exists) throw new Error("Event not found");
  const result = await resendFailedEmails(eventId, eventDoc.data()!.notionGuideUrl || "");
  console.log("[bulkResendFailed] result", result);
  revalidatePath(`/events`);
  return result;
}
