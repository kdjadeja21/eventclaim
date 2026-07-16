"use server";

import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { assignPendingForEvent } from "@/lib/assignment";
import { parseCouponCsv } from "@/lib/import";
import { Coupon, CouponKind, CouponLink, Grant } from "@/lib/types";
import { FieldValue } from "firebase-admin/firestore";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

// ─── Create a new coupon definition ───────────────────────────────────────────

export async function createCoupon(
  eventId: string,
  data: {
    name: string;
    kind: CouponKind;
    category: string;
    logoUrl: string;
    highlight: string;
    description: string;
    note?: string;
    sharedValue?: string;
    redeemUrl?: string;
    sortOrder?: number;
  },
  slug: string
): Promise<{ success: boolean; couponId?: string; error?: string }> {
  const session = await requireSession();

  if (!data.name.trim()) return { success: false, error: "Name is required." };
  if (data.kind === "sharedCode" || data.kind === "sharedLink") {
    if (!data.sharedValue?.trim()) {
      return { success: false, error: "A value is required for this coupon type." };
    }
  }

  const id = nanoid();
  const snap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .orderBy("sortOrder", "desc")
    .limit(1)
    .get();

  const maxOrder = snap.empty
    ? 0
    : (snap.docs[0].data() as Coupon).sortOrder ?? 0;

  const trimOrNull = (v?: string) => v?.trim() || null;

  const couponData: Record<string, unknown> = {
    id,
    eventId,
    name: data.name.trim(),
    kind: data.kind,
    category: data.category.trim(),
    logoUrl: data.logoUrl.trim(),
    highlight: data.highlight.trim(),
    description: data.description.trim(),
    sortOrder: data.sortOrder ?? maxOrder + 1,
    isDisabled: false,
    createdAt: new Date().toISOString(),
  };

  // Only include optional fields when they have a value — Firestore rejects `undefined`
  const note = trimOrNull(data.note);
  if (note) couponData.note = note;
  const sharedValue = trimOrNull(data.sharedValue);
  if (sharedValue) couponData.sharedValue = sharedValue;
  const redeemUrl = trimOrNull(data.redeemUrl);
  if (redeemUrl) couponData.redeemUrl = redeemUrl;
  if (data.kind === "uniqueLink") {
    couponData.linkTotal = 0;
    couponData.linkAvailable = 0;
  }

  const coupon = couponData as unknown as Coupon;

  await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(id)
    .set(coupon);

  await writeAuditLog({
    eventId,
    action: "coupon_created",
    metadata: { couponId: id, name: coupon.name, kind: coupon.kind },
    userId: session.uid,
  });

  // Grant this new coupon to all existing eligible attendees
  await assignPendingForEvent(eventId);

  revalidatePath(`/events/${slug}/coupons`);
  return { success: true, couponId: id };
}

// ─── Update an existing coupon definition ─────────────────────────────────────

export async function updateCoupon(
  eventId: string,
  couponId: string,
  data: Partial<{
    name: string;
    category: string;
    logoUrl: string;
    highlight: string;
    description: string;
    note: string;
    sharedValue: string;
    redeemUrl: string;
    sortOrder: number;
  }>,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const couponRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId);

  const snap = await couponRef.get();
  if (!snap.exists) return { success: false, error: "Coupon not found." };

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.category !== undefined) update.category = data.category.trim();
  if (data.logoUrl !== undefined) update.logoUrl = data.logoUrl.trim();
  if (data.highlight !== undefined) update.highlight = data.highlight.trim();
  if (data.description !== undefined) update.description = data.description.trim();
  // For optional fields, omit the key entirely when the value is empty to avoid
  // writing null/undefined to Firestore unintentionally — caller must pass the
  // field explicitly when they want to clear it.
  if (data.note !== undefined) update.note = data.note.trim() || null;
  if (data.sharedValue !== undefined) update.sharedValue = data.sharedValue.trim() || null;
  if (data.redeemUrl !== undefined) update.redeemUrl = data.redeemUrl.trim() || null;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

  // Remove undefined / null keys that weren't explicitly cleared
  Object.keys(update).forEach((k) => {
    if (update[k] === undefined) delete update[k];
  });

  await couponRef.update(update);

  await writeAuditLog({
    eventId,
    action: "coupon_updated",
    metadata: { couponId, ...update },
    userId: session.uid,
  });

  revalidatePath(`/events/${slug}/coupons`);
  return { success: true };
}

// ─── Reorder coupons (sets contiguous sortOrder 0..n-1) ───────────────────────

export async function reorderCoupons(
  eventId: string,
  orderedIds: string[],
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  if (orderedIds.length === 0) {
    return { success: false, error: "No coupons to reorder." };
  }

  const couponsSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .get();

  const existingIds = new Set(couponsSnap.docs.map((d) => d.id));

  if (orderedIds.length !== existingIds.size) {
    return { success: false, error: "Coupon list is out of date. Refresh and try again." };
  }

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      return { success: false, error: "Coupon list is out of date. Refresh and try again." };
    }
  }

  // Reject duplicates
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { success: false, error: "Invalid coupon order." };
  }

  const batch = adminDb.batch();
  orderedIds.forEach((id, index) => {
    const ref = adminDb
      .collection("events")
      .doc(eventId)
      .collection("coupons")
      .doc(id);
    batch.update(ref, { sortOrder: index });
  });
  await batch.commit();

  await writeAuditLog({
    eventId,
    action: "coupon_reordered",
    metadata: { orderedIds },
    userId: session.uid,
  });

  revalidatePath(`/events/${slug}/coupons`);
  return { success: true };
}

// ─── Upload a partner offer logo to Firebase Storage ──────────────────────────

export async function uploadCouponLogo(
  eventId: string,
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  await requireSession();

  if (!eventId.trim()) {
    return { success: false, error: "Event is required." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Choose an image file to upload." };
  }

  const ext = LOGO_CONTENT_TYPES[file.type];
  if (!ext) {
    return {
      success: false,
      error: "Use a PNG, JPG, WEBP, GIF, or SVG image.",
    };
  }

  if (file.size > LOGO_MAX_BYTES) {
    return { success: false, error: "Logo must be 2 MB or smaller." };
  }

  if (!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) {
    return {
      success: false,
      error: "Storage is not configured (missing storage bucket).",
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const objectPath = `events/${eventId}/coupon-logos/${nanoid()}.${ext}`;
    const downloadToken = nanoid();

    await adminBucket.file(objectPath).save(buffer, {
      resumable: false,
      metadata: {
        contentType: file.type,
        cacheControl: "public,max-age=31536000",
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    const url =
      `https://firebasestorage.googleapis.com/v0/b/${adminBucket.name}/o/` +
      `${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;

    return { success: true, url };
  } catch (err) {
    console.error("[uploadCouponLogo]", err);
    return {
      success: false,
      error: "Failed to upload logo. Check Storage permissions and try again.",
    };
  }
}

// ─── Toggle coupon disabled state ─────────────────────────────────────────────

export async function toggleCouponDisabled(
  eventId: string,
  couponId: string,
  disabled: boolean,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const couponRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId);

  const snap = await couponRef.get();
  if (!snap.exists) return { success: false, error: "Coupon not found." };

  await couponRef.update({ isDisabled: disabled });

  await writeAuditLog({
    eventId,
    action: disabled ? "coupon_disabled" : "coupon_enabled",
    metadata: { couponId },
    userId: session.uid,
  });

  // When re-enabling, grant to any attendees who didn't get it yet
  if (!disabled) {
    await assignPendingForEvent(eventId);
  }

  revalidatePath(`/events/${slug}/coupons`);
  return { success: true };
}

// ─── Delete a coupon definition ────────────────────────────────────────────────

export async function deleteCoupon(
  eventId: string,
  couponId: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const couponRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId);

  const snap = await couponRef.get();
  if (!snap.exists) return { success: false, error: "Coupon not found." };

  const coupon = snap.data() as Coupon;

  // Release any assigned pool links back and delete them
  if (coupon.kind === "uniqueLink") {
    const linksSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("coupons")
      .doc(couponId)
      .collection("links")
      .get();

    const BATCH_SIZE = 400;
    for (let i = 0; i < linksSnap.docs.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      linksSnap.docs.slice(i, i + BATCH_SIZE).forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
    }
  }

  // Remove all grants for this coupon across all attendees
  const grantsSnap = await adminDb
    .collectionGroup("grants")
    .where("couponId", "==", couponId)
    .where("eventId", "==", eventId)
    .get();

  if (!grantsSnap.empty) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < grantsSnap.docs.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      grantsSnap.docs.slice(i, i + BATCH_SIZE).forEach((d) => {
        batch.delete(d.ref);
        // Decrement grantCount on the attendee
        const attendeeRef = adminDb
          .collection("events")
          .doc(eventId)
          .collection("attendees")
          .doc((d.data() as Grant).attendeeId);
        batch.update(attendeeRef, {
          grantCount: FieldValue.increment(-1),
        });
      });
      await batch.commit();
    }
  }

  await couponRef.delete();

  await writeAuditLog({
    eventId,
    action: "coupon_deleted",
    metadata: { couponId, name: coupon.name },
    userId: session.uid,
  });

  revalidatePath(`/events/${slug}/coupons`);
  return { success: true };
}

// ─── Add unique links to a coupon's pool ──────────────────────────────────────

export async function addCouponLinks(
  eventId: string,
  couponId: string,
  rawText: string,
  slug: string
): Promise<{
  success: boolean;
  imported: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  autoGranted: number;
  errors: string[];
  error?: string;
}> {
  const session = await requireSession();

  const couponRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId);

  const couponSnap = await couponRef.get();
  if (!couponSnap.exists) {
    return {
      success: false,
      imported: 0,
      duplicatesSkipped: 0,
      invalidSkipped: 0,
      autoGranted: 0,
      errors: [],
      error: "Coupon not found.",
    };
  }

  const coupon = couponSnap.data() as Coupon;
  if (coupon.kind !== "uniqueLink") {
    return {
      success: false,
      imported: 0,
      duplicatesSkipped: 0,
      invalidSkipped: 0,
      autoGranted: 0,
      errors: [],
      error: "Only uniqueLink coupons have a link pool.",
    };
  }

  const { rows, duplicatesInFile, invalidCount, errors } =
    parseCouponCsv(rawText);

  let imported = 0;
  let duplicatesSkipped = duplicatesInFile;

  const linksRef = couponRef.collection("links");

  for (const row of rows) {
    // Use a hash of the URL as the doc ID for dedup
    const docId = Buffer.from(
      `${couponId}:${row.couponLink}`
    ).toString("base64url").slice(0, 40);

    const existing = await linksRef.doc(docId).get();
    if (existing.exists) {
      duplicatesSkipped++;
      continue;
    }

    const link: CouponLink = {
      id: docId,
      couponId,
      eventId,
      url: row.couponLink,
      status: "available",
      assignedTo: null,
      assignedAt: null,
      claimedAt: null,
    };

    await linksRef.doc(docId).set(link);
    imported++;
  }

  if (imported > 0) {
    await couponRef.update({
      linkTotal: FieldValue.increment(imported),
      linkAvailable: FieldValue.increment(imported),
    });
  }

  await writeAuditLog({
    eventId,
    action: "coupon_links_added",
    metadata: { couponId, imported, duplicatesSkipped, invalid: invalidCount },
    userId: session.uid,
  });

  const autoGranted = imported > 0 ? await assignPendingForEvent(eventId) : 0;

  revalidatePath(`/events/${slug}/coupons`);

  return {
    success: true,
    imported,
    duplicatesSkipped,
    invalidSkipped: invalidCount,
    autoGranted,
    errors,
  };
}
