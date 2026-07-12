import { adminDb } from "@/lib/firebase/admin";
import { sendCouponEmail } from "@/lib/email";
import { Attendee, Event } from "@/lib/types";

/**
 * Serializes outbound email sends within a single server process so only one
 * EmailJS request is in flight at a time. Correctness against duplicate sends
 * is enforced separately by claimAttendeeForAutoSend (Firestore transaction).
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

/**
 * Atomically claims an attendee for auto-send. Returns the attendee snapshot
 * only if emailStatus is "pending" or "failed", grants exist, and a claim
 * token is present — then flips status to "sending" inside the transaction.
 */
export async function claimAttendeeForAutoSend(
  eventId: string,
  attendeeId: string
): Promise<Attendee | null> {
  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(attendeeRef);
    if (!snap.exists) return null;

    const attendee = snap.data() as Attendee;

    if (
      attendee.isBlacklisted ||
      !attendee.grantCount ||
      attendee.grantCount < 1 ||
      !attendee.claimToken ||
      (attendee.emailStatus !== "pending" && attendee.emailStatus !== "failed")
    ) {
      return null;
    }

    txn.update(attendeeRef, { emailStatus: "sending" });
    return { ...attendee, emailStatus: "sending" as const };
  });
}

/**
 * Sends the coupon email for an attendee when the event has auto-send enabled.
 * No-ops when auto-send is off or the attendee cannot be claimed.
 */
export async function autoSendEmailIfEnabled(
  event: Event,
  attendeeId: string
): Promise<void> {
  if (!event.autoSendEmail) return;

  const claimed = await claimAttendeeForAutoSend(event.id, attendeeId);
  if (!claimed) return;

  try {
    await enqueueSend(() =>
      sendCouponEmail(
        claimed,
        event.notionGuideUrl || "",
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
    await adminDb
      .collection("events")
      .doc(event.id)
      .collection("attendees")
      .doc(attendeeId)
      .update({ emailStatus: "failed" });
  }
}
