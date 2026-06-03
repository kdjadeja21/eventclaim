"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { assignPendingForEvent } from "@/lib/assignment";
import {
  parseLumaAttendeeCsv,
  parseCouponCsv,
  attendeeDocId,
  couponDocId,
} from "@/lib/import";
import { Attendee, AttendeeImportResult, Coupon, CouponImportResult } from "@/lib/types";

async function resolveEventId(slug: string): Promise<string> {
  const snap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) throw new Error(`Event not found: ${slug}`);
  return snap.docs[0].id;
}

export async function importAttendees(
  slug: string,
  csvText: string,
  checkedInOnly: boolean
): Promise<AttendeeImportResult> {
  const session = await requireSession();
  const eventId = await resolveEventId(slug);

  const { rows, invalidCount, errors } = parseLumaAttendeeCsv(
    csvText,
    checkedInOnly
  );

  let imported = 0;
  let skipped = 0;

  const attendeesRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees");

  for (const row of rows) {
    const docId = attendeeDocId(eventId, row.email);
    const docRef = attendeesRef.doc(docId);
    const existing = await docRef.get();

    if (existing.exists) {
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    const attendee: Attendee = {
      id: docId,
      eventId,
      name: row.name,
      email: row.email,
      couponId: null,
      couponLink: null,
      emailStatus: "pending",
      emailSentAt: null,
      claimed: false,
      claimedAt: null,
      claimToken: null,
      createdAt: now,
    };

    await docRef.set(attendee);
    imported++;
  }

  await writeAuditLog({
    eventId,
    action: "attendee_imported",
    metadata: { imported, skipped, invalid: invalidCount },
    userId: session.uid,
  });

  // Trigger reservation queue
  const assigned = await assignPendingForEvent(eventId);

  return {
    imported,
    skipped,
    invalid: invalidCount,
    waitingForCoupon: imported - assigned,
    assigned,
    errors,
  };
}

export async function importCoupons(
  slug: string,
  csvText: string
): Promise<CouponImportResult> {
  const session = await requireSession();
  const eventId = await resolveEventId(slug);

  const { rows, duplicatesInFile, invalidCount, errors } =
    parseCouponCsv(csvText);

  let imported = 0;
  let duplicatesSkipped = duplicatesInFile;

  const couponsRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons");

  for (const row of rows) {
    const docId = couponDocId(eventId, row.couponLink);
    const docRef = couponsRef.doc(docId);
    const existing = await docRef.get();

    if (existing.exists) {
      duplicatesSkipped++;
      continue;
    }

    const coupon: Coupon = {
      id: docId,
      eventId,
      couponLink: row.couponLink,
      assignedTo: null,
      status: "available",
      assignedAt: null,
      claimedAt: null,
    };

    await docRef.set(coupon);
    imported++;
  }

  await writeAuditLog({
    eventId,
    action: "coupon_imported",
    metadata: { imported, duplicatesSkipped, invalid: invalidCount },
    userId: session.uid,
  });

  // Trigger reservation queue for attendees waiting for coupons
  const autoAssigned = await assignPendingForEvent(eventId);

  return {
    imported,
    duplicatesSkipped,
    invalidSkipped: invalidCount,
    autoAssigned,
    errors,
  };
}
