import { ensureClaimToken as ensureClaimTokenRepo } from "@/lib/db/repos/attendees";

/**
 * Ensures the attendee has a claim token, creating one if they don't have
 * one yet. Returns the token. A single conditional UPDATE now, replacing the
 * old dedicated `claimTokens` collection (which existed only because
 * Firestore couldn't cheaply query a field across subcollections — Postgres
 * needs no such workaround thanks to the unique index on `claim_token`).
 */
export async function ensureClaimToken(eventId: string, attendeeId: string): Promise<string> {
  return ensureClaimTokenRepo(eventId, attendeeId);
}
