import { sendCouponEmail } from "@/lib/email";
import { Event } from "@/lib/types";
import {
  claimAttendeeForAutoSend as claimAttendeeForAutoSendRepo,
  setEmailStatus,
} from "@/lib/db/repos/attendees";
import type { EmailConfig } from "@/lib/settings";

/**
 * Serializes outbound email sends within a single server process so only one
 * EmailJS request is in flight at a time. Correctness against duplicate sends
 * is enforced separately by claimAttendeeForAutoSend (a single conditional
 * SQL UPDATE — see lib/db/repos/attendees.ts).
 */
let sendChain: Promise<unknown> = Promise.resolve();

function enqueueSend<T>(task: () => Promise<T>): Promise<T> {
  const run = sendChain.then(task, task);
  sendChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function claimAttendeeForAutoSend(eventId: string, attendeeId: string) {
  return claimAttendeeForAutoSendRepo(eventId, attendeeId);
}

/**
 * Sends the coupon email for an attendee when the event has auto-send enabled.
 * No-ops when auto-send is off, EmailJS isn't configured (the admin hasn't
 * saved credentials on the Settings page yet), or the attendee cannot be
 * claimed.
 */
export async function autoSendEmailIfEnabled(
  event: Event,
  attendeeId: string,
  emailConfig?: EmailConfig
): Promise<void> {
  if (!event.autoSendEmail) return;
  if (
    !emailConfig ||
    !emailConfig.serviceId ||
    !emailConfig.templateId ||
    !emailConfig.publicKey ||
    !emailConfig.privateKey
  ) {
    console.warn(
      "[autoSendEmailIfEnabled] skipped — EmailJS is not configured for this browser session",
      { eventId: event.id, attendeeId }
    );
    return;
  }

  const claimed = await claimAttendeeForAutoSend(event.id, attendeeId);
  if (!claimed) return;

  try {
    await enqueueSend(() =>
      sendCouponEmail(
        claimed,
        event.notionGuideUrl || "",
        emailConfig,
        false,
        event.name
      )
    );
  } catch (err) {
    console.error("[autoSendEmailIfEnabled] unexpected error", {
      eventId: event.id,
      attendeeId,
      error: err instanceof Error ? err.message : err,
    });
    await setEmailStatus(event.id, attendeeId, "failed");
  }
}
