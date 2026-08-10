import "server-only";
import { canAccessEvent } from "@/lib/auth/data-scope";
import {
  getEventById,
  getEventBySlug,
} from "@/lib/db/repos/events";
import { requireSession } from "@/lib/session";
import { Event } from "@/lib/types";

/**
 * Load an event by slug for the current session, enforcing test-login
 * isolation. Returns null when missing or outside the caller's scope.
 */
export async function requireAccessibleEventBySlug(
  slug: string
): Promise<Event> {
  const session = await requireSession();
  const event = await getEventBySlug(slug);
  if (!event || !canAccessEvent(session.uid, event)) {
    throw new Error(`Event not found: ${slug}`);
  }
  return event;
}

/**
 * Load an event by id for the current session, enforcing test-login
 * isolation. Returns null-equivalent error when outside scope.
 */
export async function requireAccessibleEventById(
  eventId: string
): Promise<Event> {
  const session = await requireSession();
  const event = await getEventById(eventId);
  if (!event || !canAccessEvent(session.uid, event)) {
    throw new Error(`Event not found: ${eventId}`);
  }
  return event;
}
