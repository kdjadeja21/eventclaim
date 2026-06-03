"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import {
  sendCouponEmail,
  sendPendingEmails,
  resendFailedEmails,
  sendCouponEmailsConcurrent,
  type AttendeeSendStatus,
} from "@/lib/email";
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
  if (!attendee.couponId) {
    return { success: false, error: "No coupon assigned — cannot send email" };
  }
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
  if (!attendee.couponId) {
    return { success: false, error: "No coupon assigned — cannot resend email" };
  }
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
): Promise<{ sent: number; failed: number; skipped: number }> {
  console.log("[bulkResendFailed] start", { eventId });
  await requireSession();
  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  if (!eventDoc.exists) throw new Error("Event not found");
  const result = await resendFailedEmails(eventId, eventDoc.data()!.notionGuideUrl || "");
  console.log("[bulkResendFailed] result", result);
  revalidatePath(`/events`);
  return result;
}

export async function bulkSendSelected(
  eventId: string,
  attendeeIds: string[],
  mode: "send" | "resend"
): Promise<{
  success: number;
  failed: number;
  skipped: number;
  results: { attendeeId: string; status: AttendeeSendStatus; error?: string }[];
}> {
  console.log("[bulkSendSelected] start", {
    eventId,
    count: attendeeIds.length,
    mode,
  });
  // Validate the session and load the event a single time for the whole batch,
  // instead of once per attendee.
  await requireSession();

  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  if (!eventDoc.exists) throw new Error("Event not found");
  const notionGuideUrl = eventDoc.data()!.notionGuideUrl || "";

  const isResend = mode === "resend";
  const attendeesRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees");

  // Batch-read all selected attendees. Firestore getAll accepts many refs; we
  // chunk defensively to keep individual reads bounded.
  const results: {
    attendeeId: string;
    status: AttendeeSendStatus;
    error?: string;
  }[] = [];
  const toSend: Attendee[] = [];

  const READ_CHUNK = 300;
  for (let i = 0; i < attendeeIds.length; i += READ_CHUNK) {
    const idsChunk = attendeeIds.slice(i, i + READ_CHUNK);
    const refs = idsChunk.map((id) => attendeesRef.doc(id));
    const docs = await adminDb.getAll(...refs);

    for (const doc of docs) {
      if (!doc.exists) {
        results.push({
          attendeeId: doc.id,
          status: "skipped",
          error: "Attendee not found",
        });
        continue;
      }
      const attendee = doc.data() as Attendee;
      if (!attendee.couponId) {
        results.push({
          attendeeId: attendee.id,
          status: "skipped",
          error: "No coupon assigned — cannot send email",
        });
        continue;
      }
      // In "send" mode, never re-send to someone already marked sent.
      if (!isResend && attendee.emailStatus === "sent") {
        results.push({
          attendeeId: attendee.id,
          status: "skipped",
          error: "Already sent",
        });
        continue;
      }
      toSend.push(attendee);
    }
  }

  const sendResult = await sendCouponEmailsConcurrent(
    toSend,
    notionGuideUrl,
    isResend
  );
  results.push(...sendResult.results);

  revalidatePath(`/events`);

  const success = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  console.log("[bulkSendSelected] result", { success, failed, skipped });
  return { success, failed, skipped, results };
}
