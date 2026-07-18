"use server";

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { writeAuditLog } from "@/lib/audit";
import { requireSession } from "@/lib/session";
import { Attendee, AttendeeGrantDetail, Coupon, Event, Grant } from "@/lib/types";
import { revalidatePath } from "next/cache";
import { attendeeDocId } from "@/lib/import";
import { normalizeEmail } from "@/lib/utils";
import { z } from "zod";
import { fetchAllLumaGuests, FetchAllGuestsParams } from "@/lib/luma";
import { assignPendingForEvent } from "@/lib/assignment";

async function deleteQueryInBatches(
  query: FirebaseFirestore.Query
): Promise<number> {
  let totalDeleted = 0;
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

export async function getAttendees(slug: string): Promise<{ attendees: Attendee[]; eventId: string }> {
  await requireSession();

  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");

  const eventId = eventSnap.docs[0].id;

  const attendeesSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .orderBy("createdAt", "desc")
    .get();

  return {
    attendees: attendeesSnap.docs.map((d) => d.data() as Attendee),
    eventId,
  };
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
  await requireSession();

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  const [attendeeSnap, logsSnap, grantsSnap] = await Promise.all([
    attendeeRef.get(),
    adminDb
      .collection("emailLogs")
      .where("attendeeId", "==", attendeeId)
      .orderBy("sentAt", "desc")
      .limit(20)
      .get(),
    attendeeRef.collection("grants").get(),
  ]);

  if (!attendeeSnap.exists) throw new Error("Attendee not found");

  let attendee = attendeeSnap.data() as Attendee;
  const grants: AttendeeGrantDetail[] = [];

  if (!grantsSnap.empty) {
    const couponIds = [
      ...new Set(grantsSnap.docs.map((d) => (d.data() as Grant).couponId)),
    ];

    const couponDocs = await Promise.all(
      couponIds.map((id) =>
        adminDb
          .collection("events")
          .doc(eventId)
          .collection("coupons")
          .doc(id)
          .get()
      )
    );

    const couponMap = new Map(
      couponDocs
        .filter((d) => d.exists)
        .map((d) => [d.id, d.data() as Coupon])
    );

    for (const grantDoc of grantsSnap.docs) {
      const grant = grantDoc.data() as Grant;
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

    const actualClaimedCount = grants.filter((g) => g.status === "claimed").length;
    const storedClaimedCount = attendee.claimedCount ?? 0;

    if (actualClaimedCount !== storedClaimedCount) {
      await attendeeRef.update({ claimedCount: actualClaimedCount });
      attendee = { ...attendee, claimedCount: actualClaimedCount };
    }
  } else if ((attendee.claimedCount ?? 0) !== 0) {
    await attendeeRef.update({ claimedCount: 0 });
    attendee = { ...attendee, claimedCount: 0 };
  }

  return {
    attendee,
    grants,
    emailLogs: logsSnap.docs.map((d) => ({
      id: d.id,
      emailType: d.data().emailType,
      sentAt: d.data().sentAt,
      status: d.data().status,
    })),
  };
}

export async function deleteAttendee(
  eventId: string,
  attendeeId: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  try {
    const snap = await attendeeRef.get();
    if (!snap.exists) {
      return { success: false, error: "Attendee not found." };
    }

    const attendee = snap.data() as Attendee;

    // Release any uniqueLink pool grants before deleting
    const grantsSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .doc(attendeeId)
      .collection("grants")
      .get();

    if (!grantsSnap.empty) {
      const batch = adminDb.batch();
      for (const grantDoc of grantsSnap.docs) {
        const grant = grantDoc.data() as Grant;
        // Only return unclaimed links to the available pool — a claimed
        // link was already redeemed by the attendee and must not be
        // handed out again.
        if (grant.linkId && grant.status !== "claimed") {
          const linkRef = adminDb
            .collection("events")
            .doc(eventId)
            .collection("coupons")
            .doc(grant.couponId)
            .collection("links")
            .doc(grant.linkId);
          batch.update(linkRef, {
            status: "available",
            assignedTo: null,
            assignedAt: null,
          });
          // Increment linkAvailable back on the coupon definition
          const couponRef = adminDb
            .collection("events")
            .doc(eventId)
            .collection("coupons")
            .doc(grant.couponId);
          batch.update(couponRef, {
            linkAvailable: FieldValue.increment(1),
          });
        }
        batch.delete(grantDoc.ref);
      }
      await batch.commit();
    }

    const deletedEmailLogs = await deleteQueryInBatches(
      adminDb.collection("emailLogs").where("attendeeId", "==", attendeeId)
    );

    if (attendee.claimToken) {
      await adminDb.collection("claimTokens").doc(attendee.claimToken).delete();
    }

    await attendeeRef.delete();

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
  checkedInOnly = false
): Promise<SyncLumaResult> {
  const session = await requireSession();

  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) {
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
  const eventId = eventSnap.docs[0].id;
  const eventData = eventSnap.docs[0].data() as Event;
  const eventIsPast = new Date(eventData.date) < new Date();

  let guests;
  try {
    guests = await fetchAllLumaGuests(lumaParams);
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

  // Apply checked-in filter before deduplication
  if (checkedInOnly) {
    guests = guests.filter((g) => g.checked_in_at !== null && g.checked_in_at !== "");
  }
  const checkedInCount = guests.length;
  const noCheckedInRecords = checkedInOnly && checkedInCount === 0;

  const attendeesRef = adminDb.collection("events").doc(eventId).collection("attendees");
  const seenEmails = new Set<string>();

  let addedCount = 0;
  let skipped = 0;
  let invalid = 0;
  let blacklistedCount = 0;
  const added: Attendee[] = [];

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

    const name =
      (guest.user_name ?? "").trim() ||
      `${(guest.user_first_name ?? "").trim()} ${(guest.user_last_name ?? "").trim()}`.trim() ||
      email;

    const docId = attendeeDocId(eventId, email);
    const docRef = attendeesRef.doc(docId);
    const existing = await docRef.get();

    if (existing.exists) {
      const existingData = existing.data() as Attendee;
      if (eventIsPast && !existingData.checkedInAt && !existingData.isBlacklisted) {
        await docRef.update({ isBlacklisted: true });
        blacklistedCount++;
      }
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    const isBlacklisted = eventIsPast && !guest.checked_in_at;
    const attendee: Attendee = {
      id: docId,
      eventId,
      name,
      email,
      grantCount: 0,
      claimedCount: 0,
      claimedAny: false,
      emailStatus: "pending",
      emailSentAt: null,
      claimToken: null,
      createdAt: now,
      registeredAt: guest.registered_at ?? null,
      checkedInAt: guest.checked_in_at ?? null,
      ...(isBlacklisted ? { isBlacklisted: true } : {}),
    };

    await docRef.set(attendee);
    added.push(attendee);
    addedCount++;
    if (isBlacklisted) blacklistedCount++;
  }

  const syncedAt = new Date().toISOString();

  await assignPendingForEvent(eventId);

  await adminDb.collection("events").doc(eventId).update({ lumaLastSyncedAt: syncedAt });

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
