"use server";

import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmail } from "@/lib/utils";
import { Attendee, Event } from "@/lib/types";

/**
 * Public (unauthenticated) event lookup by slug.
 * Mirrors getEventBySlug in the admin actions but without requireSession, and
 * excludes draft events so unpublished events are not exposed publicly.
 */
export async function getPublicEventBySlug(
  slug: string
): Promise<Pick<Event, "id" | "name" | "date" | "status" | "tagline" | "description" | "timeLabel" | "venue"> | null> {
  const snap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return null;

  const event = snap.docs[0].data() as Event;
  if (event.status === "draft") return null;

  return {
    id: event.id,
    name: event.name,
    date: event.date,
    status: event.status,
    tagline: event.tagline,
    description: event.description,
    timeLabel: event.timeLabel,
    venue: event.venue,
  };
}

export type ClaimLookupResult =
  | { status: "ok"; token: string }
  | { status: "not_found" }
  | { status: "no_offers" }
  | { status: "blocked" }
  | { status: "event_not_found" };

/**
 * Resolves an attendee's claim token from their email for a given event.
 * This powers the public, self-service claim flow (an alternative to receiving
 * the claim link by email). On success the caller navigates to /claim/{token},
 * which renders the existing offers page.
 */
export async function lookupAttendeeForClaim(
  slug: string,
  email: string
): Promise<ClaimLookupResult> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { status: "not_found" };

  const event = await getPublicEventBySlug(slug);
  if (!event) return { status: "event_not_found" };

  const attendeesSnap = await adminDb
    .collection("events")
    .doc(event.id)
    .collection("attendees")
    .where("email", "==", normalizedEmail)
    .limit(1)
    .get();

  if (attendeesSnap.empty) return { status: "not_found" };

  const attendee = attendeesSnap.docs[0].data() as Attendee;

  await writeAuditLog({
    eventId: event.id,
    action: "self_claim_lookup",
    metadata: { email: normalizedEmail },
  });

  if (attendee.isBlacklisted) return { status: "blocked" };

  if (!attendee.grantCount || attendee.grantCount < 1 || !attendee.claimToken) {
    return { status: "no_offers" };
  }

  return { status: "ok", token: attendee.claimToken };
}
