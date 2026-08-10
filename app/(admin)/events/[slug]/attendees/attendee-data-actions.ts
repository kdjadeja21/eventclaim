"use server";

import { writeAuditLog } from "@/lib/audit";
import { requireSession } from "@/lib/session";
import { Attendee, AttendeeGrantDetail } from "@/lib/types";
import { attendeeDocId } from "@/lib/import";
import { normalizeEmail } from "@/lib/utils";
import { z } from "zod";
import { fetchAllLumaGuests, FetchAllGuestsParams } from "@/lib/luma";
import { assignPendingForEvent } from "@/lib/assignment";
import {
  blacklistIfPastAndNotCheckedIn,
  bulkInsertAttendees,
  countTestAttendees,
  deleteAttendeeCascade,
  getAttendeeById,
  listAttendeesForEvent,
} from "@/lib/db/repos/attendees";
import { listEmailLogsForAttendee } from "@/lib/db/repos/email-logs";
import { listGrantsForAttendee } from "@/lib/db/repos/grants";
import { getCouponById } from "@/lib/db/repos/coupons";
import { getEventBySlugForUser, updateEventFields } from "@/lib/db/repos/events";
import { requireAccessibleEventById } from "@/lib/auth/event-access";
import type { EmailConfig } from "@/lib/settings";
import { revalidatePath } from "next/cache";

export async function getAttendees(slug: string): Promise<{ attendees: Attendee[]; eventId: string }> {
  const session = await requireSession();

  const event = await getEventBySlugForUser(slug, session.uid);
  if (!event) throw new Error("Event not found");

  const attendees = await listAttendeesForEvent(event.id);
  return { attendees, eventId: event.id };
}

export async function getAttendeeDetail(
  eventId: string,
  attendeeId: string
): Promise<{
  attendee: Attendee;
  grants: AttendeeGrantDetail[];
  emailLogs: Array<{
    id: string;
    emailType: string;
    sentAt: string;
    status: string;
  }>;
}> {
  await requireAccessibleEventById(eventId);

  const attendee = await getAttendeeById(eventId, attendeeId);
  if (!attendee) throw new Error("Attendee not found");

  const [logRows, grantRows] = await Promise.all([
    listEmailLogsForAttendee(attendeeId, 20),
    listGrantsForAttendee(eventId, attendeeId),
  ]);

  const grants: AttendeeGrantDetail[] = [];
  if (grantRows.length > 0) {
    const couponIds = [...new Set(grantRows.map((g) => g.couponId))];
    const couponDocs = await Promise.all(couponIds.map((id) => getCouponById(eventId, id)));
    const couponMap = new Map(
      couponDocs.filter((c) => c !== null).map((c) => [c!.id, c!])
    );

    for (const grant of grantRows) {
      const coupon = couponMap.get(grant.couponId);
      if (!coupon) continue;

      grants.push({
        couponId: grant.couponId,
        couponName: coupon.name,
        couponKind: coupon.kind,
        category: coupon.category ?? "",
        value: grant.value,
        status: grant.status,
        assignedAt: grant.assignedAt,
        claimedAt: grant.claimedAt,
      });
    }

    grants.sort((a, b) => a.couponName.localeCompare(b.couponName));
  }

  // claimedCount is now trigger-maintained on every grant status change, so
  // it can never drift — the previous recompute-and-repair logic here is no
  // longer needed.

  return {
    attendee,
    grants,
    emailLogs: logRows.map((l) => ({
      id: l.id,
      emailType: l.emailType,
      sentAt: l.sentAt,
      status: l.status,
    })),
  };
}

export async function deleteAttendee(
  eventId: string,
  attendeeId: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
    await requireAccessibleEventById(eventId);
    const attendee = await getAttendeeById(eventId, attendeeId);
    if (!attendee) {
      return { success: false, error: "Attendee not found." };
    }

    const { deletedEmailLogs } = await deleteAttendeeCascade(eventId, attendeeId);

    await writeAuditLog({
      eventId,
      action: "attendee_deleted",
      metadata: {
        attendeeId,
        name: attendee.name,
        email: attendee.email,
        deletedEmailLogs,
      },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/attendees`);
    revalidatePath(`/events/${slug}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delete failed.",
    };
  }
}

export interface SyncLumaResult {
  addedCount: number;
  skipped: number;
  totalFetched: number;
  checkedInCount: number;
  noCheckedInRecords: boolean;
  blacklistedCount: number;
  invalid: number;
  syncedAt: string;
  added: Attendee[];
  error?: string;
}

export async function syncLumaGuests(
  slug: string,
  lumaParams: FetchAllGuestsParams,
  checkedInOnly = false,
  lumaApiKey = "",
  emailConfig?: EmailConfig
): Promise<SyncLumaResult> {
  const session = await requireSession();

  const event = await getEventBySlugForUser(slug, session.uid);
  if (!event) {
    return {
      addedCount: 0,
      skipped: 0,
      totalFetched: 0,
      checkedInCount: 0,
      noCheckedInRecords: false,
      blacklistedCount: 0,
      invalid: 0,
      syncedAt: "",
      added: [],
      error: "Event not found.",
    };
  }
  const eventId = event.id;

  const testCount = await countTestAttendees(eventId);
  if (testCount > 0) {
    return {
      addedCount: 0,
      skipped: 0,
      totalFetched: 0,
      checkedInCount: 0,
      noCheckedInRecords: false,
      blacklistedCount: 0,
      invalid: 0,
      syncedAt: "",
      added: [],
      error:
        "Luma sync is disabled while temp test attendees exist. Delete test data first.",
    };
  }

  const eventIsPast = new Date(event.date) < new Date();

  let guests;
  try {
    guests = await fetchAllLumaGuests(lumaParams, lumaApiKey);
  } catch (err) {
    return {
      addedCount: 0,
      skipped: 0,
      totalFetched: 0,
      checkedInCount: 0,
      noCheckedInRecords: false,
      blacklistedCount: 0,
      invalid: 0,
      syncedAt: "",
      added: [],
      error: err instanceof Error ? err.message : "Luma API request failed.",
    };
  }

  const totalFetched = guests.length;

  if (checkedInOnly) {
    guests = guests.filter((g) => g.checked_in_at !== null && g.checked_in_at !== "");
  }
  const checkedInCount = guests.length;
  const noCheckedInRecords = checkedInOnly && checkedInCount === 0;

  const seenEmails = new Set<string>();
  let invalid = 0;
  let skipped = 0;
  let blacklistedCount = 0;

  const existingAttendeesByEmail = new Map(
    (await listAttendeesForEvent(eventId)).map((a) => [a.email, a])
  );

  const now = new Date().toISOString();
  const rowsToInsert: Array<{
    id: string;
    eventId: string;
    name: string;
    email: string;
    createdAt: string;
    registeredAt?: string | null;
    checkedInAt?: string | null;
    isBlacklisted?: boolean;
  }> = [];

  for (const guest of guests) {
    const rawEmail = guest.user_email ?? "";
    const email = normalizeEmail(rawEmail);

    if (!email || !z.string().email().safeParse(email).success) {
      invalid++;
      continue;
    }

    if (seenEmails.has(email)) {
      skipped++;
      continue;
    }
    seenEmails.add(email);

    const existing = existingAttendeesByEmail.get(email);
    if (existing) {
      if (eventIsPast && !existing.checkedInAt && !existing.isBlacklisted) {
        const didBlacklist = await blacklistIfPastAndNotCheckedIn(eventId, existing.id);
        if (didBlacklist) blacklistedCount++;
      }
      skipped++;
      continue;
    }

    const name =
      (guest.user_name ?? "").trim() ||
      `${(guest.user_first_name ?? "").trim()} ${(guest.user_last_name ?? "").trim()}`.trim() ||
      email;

    const isBlacklisted = eventIsPast && !guest.checked_in_at;
    if (isBlacklisted) blacklistedCount++;

    rowsToInsert.push({
      id: attendeeDocId(eventId, email),
      eventId,
      name,
      email,
      createdAt: now,
      registeredAt: guest.registered_at ?? null,
      checkedInAt: guest.checked_in_at ?? null,
      isBlacklisted,
    });
  }

  // Bulk insert every new attendee in one statement instead of one
  // get()-then-set() round trip per row.
  const { inserted: added, insertedCount: addedCount, skippedCount: raceSkipped } =
    await bulkInsertAttendees(rowsToInsert);
  skipped += raceSkipped;

  const syncedAt = new Date().toISOString();

  await assignPendingForEvent(eventId, emailConfig);
  await updateEventFields(eventId, { lumaLastSyncedAt: syncedAt });

  await writeAuditLog({
    eventId,
    action: "attendee_luma_synced",
    metadata: {
      lumaEventId: lumaParams.event_id,
      totalFetched,
      addedCount,
      skipped,
      invalid,
      blacklistedCount,
    },
    userId: session.uid,
  });

  return {
    addedCount,
    skipped,
    totalFetched,
    checkedInCount,
    noCheckedInRecords,
    blacklistedCount,
    invalid,
    syncedAt,
    added,
  };
}
