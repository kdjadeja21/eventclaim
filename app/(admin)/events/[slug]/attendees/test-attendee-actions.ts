"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmail } from "@/lib/utils";
import { ensureDefaultCursorCreditsCoupon } from "@/lib/default-offers";
import { getEventById } from "@/lib/db/repos/events";
import { countTestAttendees, findAttendeeByEmailInEvent } from "@/lib/db/repos/attendees";
import {
  createTempTestAttendeesWithLinks,
  deleteTempTestDataForEvent,
} from "@/lib/db/repos/test-data";

const TempPersonSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
});

const TempAttendeesSchema = z
  .tuple([TempPersonSchema, TempPersonSchema])
  .refine(
    ([a, b]) => normalizeEmail(a.email) !== normalizeEmail(b.email),
    { message: "The two temp attendees must have different emails." }
  );

function withTestNamePrefix(name: string): string {
  const trimmed = name.trim();
  if (trimmed.toLowerCase().startsWith("test_")) {
    // Preserve exact test_ prefix casing for the required prefix.
    return trimmed.startsWith("test_") ? trimmed : `test_${trimmed.slice(5)}`;
  }
  return `test_${trimmed}`;
}

export async function hasTempTestAttendees(eventId: string): Promise<boolean> {
  await requireSession();
  return (await countTestAttendees(eventId)) > 0;
}

export async function createTempAttendees(
  eventId: string,
  slug: string,
  people: [{ name: string; email: string }, { name: string; email: string }]
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const event = await getEventById(eventId);
  if (!event) return { success: false, error: "Event not found." };
  if (event.status !== "draft") {
    return { success: false, error: "Temp attendees can only be created while the event is in draft." };
  }

  const existingTestCount = await countTestAttendees(eventId);
  if (existingTestCount > 0) {
    return { success: false, error: "Temp attendees already exist for this event." };
  }

  const parsed = TempAttendeesSchema.safeParse(people);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid temp attendee input.",
    };
  }

  const normalized = parsed.data.map((p) => ({
    name: withTestNamePrefix(p.name),
    email: normalizeEmail(p.email),
  })) as [{ name: string; email: string }, { name: string; email: string }];

  for (const person of normalized) {
    const existing = await findAttendeeByEmailInEvent(eventId, person.email);
    if (existing) {
      return {
        success: false,
        error: `An attendee with email ${person.email} already exists.`,
      };
    }
  }

  try {
    const coupon = await ensureDefaultCursorCreditsCoupon(eventId);
    if (coupon.kind !== "uniqueLink") {
      return {
        success: false,
        error: "Cursor Credits offer must be a unique-link coupon.",
      };
    }

    const { attendees: created, linkIds } = await createTempTestAttendeesWithLinks({
      eventId,
      couponId: coupon.id,
      people: normalized,
    });

    await writeAuditLog({
      eventId,
      action: "test_attendees_created",
      metadata: {
        attendeeIds: created.map((a) => a.id),
        emails: created.map((a) => a.email),
        linkIds,
        couponId: coupon.id,
      },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/attendees`);
    revalidatePath(`/events/${slug}`);
    revalidatePath(`/events/${slug}/coupons`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create temp attendees.",
    };
  }
}

export async function deleteTempTestData(
  eventId: string,
  slug: string
): Promise<{ success: boolean; error?: string; deletedAttendees?: number; deletedLinks?: number }> {
  const session = await requireSession();

  const event = await getEventById(eventId);
  if (!event) return { success: false, error: "Event not found." };

  try {
    const result = await deleteTempTestDataForEvent(eventId);

    await writeAuditLog({
      eventId,
      action: "test_data_deleted",
      metadata: {
        reason: "manual",
        deletedAttendees: result.deletedAttendees,
        deletedLinks: result.deletedLinks,
      },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/attendees`);
    revalidatePath(`/events/${slug}`);
    revalidatePath(`/events/${slug}/coupons`);
    return {
      success: true,
      deletedAttendees: result.deletedAttendees,
      deletedLinks: result.deletedLinks,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete test data.",
    };
  }
}
