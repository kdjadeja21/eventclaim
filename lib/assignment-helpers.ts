import { adminDb } from "@/lib/firebase/admin";
import { Attendee } from "@/lib/types";
import { nanoid } from "nanoid";

/**
 * Ensures the attendee has a claimToken, creating one transactionally
 * if they don't have one yet. Returns the token.
 */
export async function ensureClaimToken(
  eventId: string,
  attendeeId: string
): Promise<string> {
  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  return adminDb.runTransaction(async (txn) => {
    const snap = await txn.get(attendeeRef);
    if (!snap.exists) throw new Error("Attendee not found");
    const attendee = snap.data() as Attendee;
    if (attendee.claimToken) return attendee.claimToken;

    const token = nanoid(32);
    const tokenRef = adminDb.collection("claimTokens").doc(token);
    txn.set(tokenRef, {
      token,
      eventId,
      attendeeId,
      createdAt: new Date().toISOString(),
    });
    txn.update(attendeeRef, { claimToken: token });
    return token;
  });
}
