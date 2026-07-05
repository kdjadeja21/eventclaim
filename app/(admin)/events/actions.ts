"use server";

import { adminDb } from "@/lib/firebase/admin";
import type FirebaseFirestore from "@google-cloud/firestore";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { Event, EventStatus } from "@/lib/types";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const EventSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  date: z.string().min(1, "Date is required"),
  notionGuideUrl: z.string().url("Must be a valid URL").or(z.literal("")),
  status: z.enum(["draft", "active", "completed"]),
  tagline: z.string().optional(),
  description: z.string().optional(),
  timeLabel: z.string().optional(),
  venue: z.string().optional(),
});

export async function createEvent(
  _prevState: unknown,
  formData: FormData
): Promise<{ success: boolean; eventId?: string; slug?: string; errors?: Record<string, string[]> }> {
  const session = await requireSession();

  const raw = {
    name: formData.get("name") as string,
    date: formData.get("date") as string,
    notionGuideUrl: (formData.get("notionGuideUrl") as string) || "",
    status: (formData.get("status") as EventStatus) || "draft",
    tagline: (formData.get("tagline") as string) || undefined,
    description: (formData.get("description") as string) || undefined,
    timeLabel: (formData.get("timeLabel") as string) || undefined,
    venue: (formData.get("venue") as string) || undefined,
  };

  const parsed = EventSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, errors: parsed.error.flatten().fieldErrors };
  }

  const id = nanoid();
  const slug = slugify(parsed.data.name) + "-" + id.slice(0, 6);
  const now = new Date().toISOString();

  const event: Event = {
    id,
    name: parsed.data.name,
    slug,
    date: parsed.data.date,
    notionGuideUrl: parsed.data.notionGuideUrl,
    status: parsed.data.status,
    createdAt: now,
    updatedAt: now,
    ...(parsed.data.tagline ? { tagline: parsed.data.tagline } : {}),
    ...(parsed.data.description ? { description: parsed.data.description } : {}),
    ...(parsed.data.timeLabel ? { timeLabel: parsed.data.timeLabel } : {}),
    ...(parsed.data.venue ? { venue: parsed.data.venue } : {}),
  };

  await adminDb.collection("events").doc(id).set(event);
  await writeAuditLog({
    eventId: id,
    action: "event_created",
    metadata: { name: event.name, slug },
    userId: session.uid,
  });

  revalidatePath("/events");
  return { success: true, eventId: id, slug };
}

const EventSettingsSchema = z.object({
  notionGuideUrl: z.string().url("Must be a valid URL").or(z.literal("")),
});

export async function updateEventHero(
  eventId: string,
  data: {
    tagline?: string;
    description?: string;
    timeLabel?: string;
    venue?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  if (!eventDoc.exists) return { success: false, error: "Event not found" };
  const event = eventDoc.data() as Event;

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (data.tagline !== undefined) update.tagline = data.tagline || null;
  if (data.description !== undefined) update.description = data.description || null;
  if (data.timeLabel !== undefined) update.timeLabel = data.timeLabel || null;
  if (data.venue !== undefined) update.venue = data.venue || null;

  await adminDb.collection("events").doc(eventId).update(update);

  await writeAuditLog({
    eventId,
    action: "event_hero_updated",
    metadata: data,
    userId: session.uid,
  });

  revalidatePath("/events");
  revalidatePath(`/events/${event.slug}`);
  return { success: true };
}

export async function updateEventSettings(
  eventId: string,
  data: { notionGuideUrl: string }
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const parsed = EventSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.flatten().fieldErrors.notionGuideUrl?.[0] ?? "Invalid URL",
    };
  }

  const eventDoc = await adminDb.collection("events").doc(eventId).get();
  if (!eventDoc.exists) {
    return { success: false, error: "Event not found" };
  }

  const event = eventDoc.data() as Event;

  await adminDb.collection("events").doc(eventId).update({
    notionGuideUrl: parsed.data.notionGuideUrl,
    updatedAt: new Date().toISOString(),
  });

  await writeAuditLog({
    eventId,
    action: "event_updated",
    metadata: { notionGuideUrl: parsed.data.notionGuideUrl },
    userId: session.uid,
  });

  revalidatePath("/events");
  revalidatePath(`/events/${event.slug}`);
  return { success: true };
}

export async function updateEventStatus(
  eventId: string,
  status: EventStatus
): Promise<{ success: boolean }> {
  const session = await requireSession();

  await adminDb.collection("events").doc(eventId).update({
    status,
    updatedAt: new Date().toISOString(),
  });

  await writeAuditLog({
    eventId,
    action: "event_updated",
    metadata: { status },
    userId: session.uid,
  });

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  return { success: true };
}

export async function getEvents(): Promise<Event[]> {
  await requireSession();
  if (process.env.USE_DEV_DATA === "true") {
    const { listDevEvents } = await import("@/lib/dev-store");
    return listDevEvents();
  }
  const snap = await adminDb
    .collection("events")
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map((d) => d.data() as Event);
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  const { getEventBySlugCached } = await import("@/lib/event-resolve");
  return getEventBySlugCached(slug);
}

export async function getEventById(id: string): Promise<Event | null> {
  await requireSession();
  if (process.env.USE_DEV_DATA === "true") {
    const { getDevEventById } = await import("@/lib/dev-store");
    return getDevEventById(id);
  }
  const doc = await adminDb.collection("events").doc(id).get();
  if (!doc.exists) return null;
  return doc.data() as Event;
}

async function deleteQueryInBatches(
  query: FirebaseFirestore.Query
): Promise<number> {
  let totalDeleted = 0;
  // Keep fetching and deleting until the collection is empty
  for (;;) {
    const snapshot = await query.limit(500).get();
    if (snapshot.empty) break;
    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snapshot.size;
    if (snapshot.size < 500) break;
  }
  return totalDeleted;
}

export async function deleteEvent(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
    const eventDoc = await adminDb.collection("events").doc(eventId).get();
    if (!eventDoc.exists) {
      return { success: false, error: "Event not found." };
    }
    const event = eventDoc.data() as Event;

    // Delete top-level collections that reference this event
    const deletedEmailLogs = await deleteQueryInBatches(
      adminDb.collection("emailLogs").where("eventId", "==", eventId)
    );
    const deletedClaimTokens = await deleteQueryInBatches(
      adminDb.collection("claimTokens").where("eventId", "==", eventId)
    );

    // Recursively delete the event doc + all subcollections (attendees, coupons)
    await adminDb.recursiveDelete(adminDb.collection("events").doc(eventId));

    // Write audit log with null eventId since the event no longer exists;
    // original details are captured in metadata for traceability
    await writeAuditLog({
      eventId: null,
      action: "event_deleted",
      metadata: {
        deletedEventId: eventId,
        name: event.name,
        slug: event.slug,
        deletedEmailLogs,
        deletedClaimTokens,
      },
      userId: session.uid,
    });

    revalidatePath("/events");
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delete failed.",
    };
  }
}
