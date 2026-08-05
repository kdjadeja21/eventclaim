"use server";

import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import { Event, EventStatus } from "@/lib/types";
import {
  deleteEventCascade,
  getEventById as getEventByIdRepo,
  getEventBySlug as getEventBySlugRepo,
  insertEvent,
  listEvents,
  updateEventFields,
} from "@/lib/db/repos/events";
import { ensureDefaultCursorCreditsCoupon } from "@/lib/default-offers";
import { deleteTempTestDataForEvent } from "@/lib/db/repos/test-data";
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

  await insertEvent(event);

  const defaultOffer = await ensureDefaultCursorCreditsCoupon(id);
  await writeAuditLog({
    eventId: id,
    action: "event_created",
    metadata: { name: event.name, slug },
    userId: session.uid,
  });
  await writeAuditLog({
    eventId: id,
    action: "coupon_created",
    metadata: {
      couponId: defaultOffer.id,
      name: defaultOffer.name,
      kind: defaultOffer.kind,
      defaultOffer: true,
    },
    userId: session.uid,
  });

  revalidatePath("/events");
  return { success: true, eventId: id, slug };
}

const EventSettingsSchema = z.object({
  notionGuideUrl: z.string().url("Must be a valid URL").or(z.literal("")),
});

const EventHeroSchema = z.object({
  date: z.string().min(1, "Date is required"),
  tagline: z.string().optional(),
  description: z.string().optional(),
  timeLabel: z.string().optional(),
  venue: z.string().optional(),
});

export async function updateEventHero(
  eventId: string,
  data: {
    date: string;
    tagline?: string;
    description?: string;
    timeLabel?: string;
    venue?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const parsed = EventHeroSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.flatten().fieldErrors.date?.[0] ?? "Invalid input",
    };
  }

  const event = await getEventByIdRepo(eventId);
  if (!event) return { success: false, error: "Event not found" };

  await updateEventFields(eventId, {
    date: parsed.data.date,
    tagline: parsed.data.tagline || null,
    description: parsed.data.description || null,
    timeLabel: parsed.data.timeLabel || null,
    venue: parsed.data.venue || null,
  });

  await writeAuditLog({
    eventId,
    action: "event_hero_updated",
    metadata: parsed.data,
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

  const event = await getEventByIdRepo(eventId);
  if (!event) return { success: false, error: "Event not found" };

  await updateEventFields(eventId, { notionGuideUrl: parsed.data.notionGuideUrl });

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

export async function setAutoSendEmail(
  eventId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const event = await getEventByIdRepo(eventId);
  if (!event) return { success: false, error: "Event not found" };

  await updateEventFields(eventId, { autoSendEmail: enabled });

  await writeAuditLog({
    eventId,
    action: "event_updated",
    metadata: { autoSendEmail: enabled },
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

  const event = await getEventByIdRepo(eventId);
  if (!event) return { success: false };

  // Leaving draft always strips draft-only temp test attendees and fake links.
  let deletedTestData = false;
  if (event.status === "draft" && status !== "draft") {
    const result = await deleteTempTestDataForEvent(eventId);
    deletedTestData = result.deletedAttendees > 0 || result.deletedLinks > 0;
    if (deletedTestData) {
      await writeAuditLog({
        eventId,
        action: "test_data_deleted",
        metadata: {
          reason: "status_change",
          deletedAttendees: result.deletedAttendees,
          deletedLinks: result.deletedLinks,
        },
        userId: session.uid,
      });
    }
  }

  await updateEventFields(eventId, { status });

  await writeAuditLog({
    eventId,
    action: "event_updated",
    metadata: { status, deletedTestData },
    userId: session.uid,
  });

  revalidatePath("/events");
  revalidatePath(`/events/${event.slug}`);
  revalidatePath(`/events/${event.slug}/attendees`);
  return { success: true };
}

export async function getEvents(): Promise<Event[]> {
  await requireSession();
  return listEvents();
}

export async function getEventBySlug(slug: string): Promise<Event | null> {
  await requireSession();
  return getEventBySlugRepo(slug);
}

export async function getEventById(id: string): Promise<Event | null> {
  await requireSession();
  return getEventByIdRepo(id);
}

export async function deleteEvent(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
    const event = await getEventByIdRepo(eventId);
    if (!event) {
      return { success: false, error: "Event not found." };
    }

    // A single DELETE cascades to attendees, coupons, coupon_links, grants,
    // and email_logs via ON DELETE CASCADE — replacing the previous
    // deleteQueryInBatches + recursiveDelete dance across 4+ collections.
    await deleteEventCascade(eventId);

    // Audit log keeps eventId even though the event is gone (not a foreign
    // key), so history survives deletion exactly as it did before.
    await writeAuditLog({
      eventId: null,
      action: "event_deleted",
      metadata: {
        deletedEventId: eventId,
        name: event.name,
        slug: event.slug,
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
