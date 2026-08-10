"use server";

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
import { getAttendeeById, listAttendeesByIds } from "@/lib/db/repos/attendees";
import { getEventByIdForUser } from "@/lib/db/repos/events";
import { Attendee } from "@/lib/types";
import type { EmailConfig } from "@/lib/settings";
import { revalidatePath } from "next/cache";

async function getEventAndAttendee(
  sessionUid: string,
  eventId: string,
  attendeeId: string
) {
  const [event, attendee] = await Promise.all([
    getEventByIdForUser(eventId, sessionUid),
    getAttendeeById(eventId, attendeeId),
  ]);
  if (!event) throw new Error("Event not found");
  if (!attendee) throw new Error("Attendee not found");
  return { event, attendee };
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
  const session = await requireSession();
  const { event, attendee } = await getEventAndAttendee(session.uid, eventId, attendeeId);
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
  const session = await requireSession();
  const { event, attendee } = await getEventAndAttendee(session.uid, eventId, attendeeId);
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
  const session = await requireSession();
  const event = await getEventByIdForUser(eventId, session.uid);
  if (!event) throw new Error("Event not found");
  const result = await sendPendingEmails(eventId, event.notionGuideUrl || "", config);
  revalidatePath(`/events`);
  const quota = await getEmailQuota(config);
  return { ...result, quota };
}

export async function bulkResendFailed(
  eventId: string,
  config: EmailConfig
): Promise<{ sent: number; failed: number; skipped: number; quota: EmailQuota }> {
  const session = await requireSession();
  const event = await getEventByIdForUser(eventId, session.uid);
  if (!event) throw new Error("Event not found");
  const result = await resendFailedEmails(eventId, event.notionGuideUrl || "", config);
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
  const session = await requireSession();

  const event = await getEventByIdForUser(eventId, session.uid);
  if (!event) throw new Error("Event not found");
  const notionGuideUrl = event.notionGuideUrl || "";

  const isResend = mode === "resend";

  // Batch-read all selected attendees in one query (chunked defensively for
  // very large selections) instead of Firestore's getAll-per-chunk pattern.
  const results: {
    attendeeId: string;
    status: AttendeeSendStatus;
    error?: string;
  }[] = [];
  const toSend: Attendee[] = [];

  const READ_CHUNK = 1000;
  for (let i = 0; i < attendeeIds.length; i += READ_CHUNK) {
    const idsChunk = attendeeIds.slice(i, i + READ_CHUNK);
    const rows = await listAttendeesByIds(idsChunk);
    const byId = new Map(rows.map((a) => [a.id, a]));

    for (const id of idsChunk) {
      const attendee = byId.get(id);
      if (!attendee) {
        results.push({ attendeeId: id, status: "skipped", error: "Attendee not found" });
        continue;
      }
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
        results.push({ attendeeId: attendee.id, status: "skipped", error: "Already sent" });
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
