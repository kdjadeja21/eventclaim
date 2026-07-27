"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import {
  sendCouponEmail,
  sendPendingEmails,
  resendFailedEmails,
  sendCouponEmailsConcurrent,
  getEmailQuota,
  type AttendeeSendStatus,
  type EmailQuota,
} from "@/lib/email";
import { Attendee } from "@/lib/types";
import type { EmailConfig } from "@/lib/settings";
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

export async function refreshEmailQuota(config: EmailConfig): Promise<EmailQuota> {
  await requireSession();
  return getEmailQuota(config, { force: true });
}

export async function sendSingleEmail(
  eventId: string,
  attendeeId: string,
  config: EmailConfig
): Promise<{ success: boolean; error?: string; quota: EmailQuota }> {
  await requireSession();
  const { event, attendee } = await getEventAndAttendee(eventId, attendeeId);
  if (!attendee.grantCount) {
    const quota = await getEmailQuota(config);
    return { success: false, error: "No offers granted — cannot send email", quota };
  }
  if (attendee.emailStatus === "sending") {
    const quota = await getEmailQuota(config);
    return { success: false, error: "Email is already being sent", quota };
  }
  const result = await sendCouponEmail(attendee, event.notionGuideUrl || "", config, false, event.name);
  revalidatePath(`/events`);
  const quota = await getEmailQuota(config);
  return { ...result, quota };
}

export async function resendSingleEmail(
  eventId: string,
  attendeeId: string,
  config: EmailConfig
): Promise<{ success: boolean; error?: string; quota: EmailQuota }> {
  await requireSession();
  const { event, attendee } = await getEventAndAttendee(eventId, attendeeId);
  if (!attendee.grantCount) {
    const quota = await getEmailQuota(config);
    return { success: false, error: "No offers granted — cannot resend email", quota };
  }
  if (attendee.emailStatus === "sending") {
    const quota = await getEmailQuota(config);
    return { success: false, error: "Email is already being sent", quota };
  }
  const result = await sendCouponEmail(attendee, event.notionGuideUrl || "", config, true, event.name);
  revalidatePath(`/events`);
  const quota = await getEmailQuota(config);
  return { ...result, quota };
}

export async function bulkSendPending(
  eventId: string,
  config: EmailConfig
): Promise<{ sent: number; failed: number; skipped: number; quota: EmailQuota }> {
  await requireSession();
  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  if (!eventDoc.exists) throw new Error("Event not found");
  const result = await sendPendingEmails(eventId, eventDoc.data()!.notionGuideUrl || "", config);
  revalidatePath(`/events`);
  const quota = await getEmailQuota(config);
  return { ...result, quota };
}

export async function bulkResendFailed(
  eventId: string,
  config: EmailConfig
): Promise<{ sent: number; failed: number; skipped: number; quota: EmailQuota }> {
  await requireSession();
  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  if (!eventDoc.exists) throw new Error("Event not found");
  const result = await resendFailedEmails(eventId, eventDoc.data()!.notionGuideUrl || "", config);
  revalidatePath(`/events`);
  const quota = await getEmailQuota(config);
  return { ...result, quota };
}

export async function bulkSendSelected(
  eventId: string,
  attendeeIds: string[],
  mode: "send" | "resend",
  config: EmailConfig
): Promise<{
  success: number;
  failed: number;
  skipped: number;
  quota: EmailQuota;
  results: { attendeeId: string; status: AttendeeSendStatus; error?: string }[];
}> {
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
      if (!attendee.grantCount) {
        results.push({
          attendeeId: attendee.id,
          status: "skipped",
          error: "No offers granted — cannot send email",
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
      if (attendee.emailStatus === "sending") {
        results.push({
          attendeeId: attendee.id,
          status: "skipped",
          error: "Email is already being sent",
        });
        continue;
      }
      toSend.push(attendee);
    }
  }

  const sendResult = await sendCouponEmailsConcurrent(
    toSend,
    notionGuideUrl,
    config,
    isResend
  );
  results.push(...sendResult.results);

  revalidatePath(`/events`);

  const success = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  const quota = await getEmailQuota(config);
  return { success, failed, skipped, results, quota };
}
