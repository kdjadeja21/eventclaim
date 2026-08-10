import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { eventOwnerScopeSql } from "@/lib/auth/data-scope";
import { db } from "@/lib/db/client";
import { events } from "@/lib/db/schema";
import { Event, EventStatus } from "@/lib/types";

function toEvent(row: typeof events.$inferSelect): Event {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    date: row.date,
    notionGuideUrl: row.notionGuideUrl,
    status: row.status as EventStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ownerUid: row.ownerUid ?? null,
    lumaLastSyncedAt: row.lumaLastSyncedAt,
    autoSendEmail: row.autoSendEmail,
    tagline: row.tagline ?? undefined,
    description: row.description ?? undefined,
    timeLabel: row.timeLabel ?? undefined,
    venue: row.venue ?? undefined,
  };
}

export async function insertEvent(event: Event): Promise<void> {
  await db.insert(events).values({
    id: event.id,
    name: event.name,
    slug: event.slug,
    date: event.date,
    notionGuideUrl: event.notionGuideUrl,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    ownerUid: event.ownerUid,
    tagline: event.tagline,
    description: event.description,
    timeLabel: event.timeLabel,
    venue: event.venue,
  });
}

export async function listEvents(): Promise<Event[]> {
  const rows = await db.select().from(events).orderBy(desc(events.createdAt));
  return rows.map(toEvent);
}

export async function listEventsForUser(sessionUid: string): Promise<Event[]> {
  const rows = await db
    .select()
    .from(events)
    .where(eventOwnerScopeSql(sessionUid))
    .orderBy(desc(events.createdAt));
  return rows.map(toEvent);
}

export async function listNonDraftEventsNewestFirst(): Promise<Event[]> {
  const rows = await db
    .select()
    .from(events)
    .where(ne(events.status, "draft"))
    .orderBy(events.status, desc(events.createdAt));
  return rows.map(toEvent);
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  const rows = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function getEventBySlugForUser(
  slug: string,
  sessionUid: string
): Promise<Event | null> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.slug, slug), eventOwnerScopeSql(sessionUid)))
    .limit(1);
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function getEventById(id: string): Promise<Event | null> {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function getEventByIdForUser(
  id: string,
  sessionUid: string
): Promise<Event | null> {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eventOwnerScopeSql(sessionUid)))
    .limit(1);
  return rows[0] ? toEvent(rows[0]) : null;
}

/** Resolves a slug to an event id, throwing if not found — used by the many
 * server actions that take a slug from the URL. Consolidates what used to be
 * a copy-pasted `resolveEventId` in four separate action files. */
export async function resolveEventId(slug: string): Promise<string> {
  const event = await getEventBySlug(slug);
  if (!event) throw new Error(`Event not found: ${slug}`);
  return event.id;
}

/** Like resolveEventId, but enforces the caller's ownership / isolation scope. */
export async function resolveEventIdForUser(
  slug: string,
  sessionUid: string
): Promise<string> {
  const event = await getEventBySlugForUser(slug, sessionUid);
  if (!event) throw new Error(`Event not found: ${slug}`);
  return event.id;
}

export async function updateEventFields(
  eventId: string,
  fields: Partial<{
    date: string;
    tagline: string | null;
    description: string | null;
    timeLabel: string | null;
    venue: string | null;
    notionGuideUrl: string;
    autoSendEmail: boolean;
    status: EventStatus;
    lumaLastSyncedAt: string;
  }>
): Promise<void> {
  await db
    .update(events)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(eq(events.id, eventId));
}

export async function listRecentEvents(limit: number): Promise<Event[]> {
  const rows = await db.select().from(events).orderBy(desc(events.createdAt)).limit(limit);
  return rows.map(toEvent);
}

export async function listRecentEventsForUser(
  sessionUid: string,
  limit: number
): Promise<Event[]> {
  const rows = await db
    .select()
    .from(events)
    .where(eventOwnerScopeSql(sessionUid))
    .orderBy(desc(events.createdAt))
    .limit(limit);
  return rows.map(toEvent);
}

/** Deletes the event and, via ON DELETE CASCADE, every attendee, coupon,
 * coupon_link, grant, and email_log that referenced it. audit_logs are kept
 * (event_id is not a foreign key) so history survives deletion. */
export async function deleteEventCascade(eventId: string): Promise<void> {
  await db.delete(events).where(eq(events.id, eventId));
}
