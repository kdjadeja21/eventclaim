"use server";

import { requireSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { assignPendingForEvent } from "@/lib/assignment";
import { parseCouponCsv } from "@/lib/import";
import { Coupon, CouponKind } from "@/lib/types";
import { bulkInsertCouponLinks } from "@/lib/db/repos/links";
import {
  deleteCouponCascade,
  getCouponById,
  getMaxSortOrder,
  insertCoupon,
  listCouponsForEvent,
  reorderCoupons as reorderCouponsRepo,
  updateCouponFields,
} from "@/lib/db/repos/coupons";
import type { EmailConfig } from "@/lib/settings";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { readdir } from "fs/promises";
import path from "path";

const PARTNER_LOGO_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
]);

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
  slug: string,
  emailConfig?: EmailConfig
): Promise<{ success: boolean; couponId?: string; error?: string }> {
  const session = await requireSession();

  if (!data.name.trim()) return { success: false, error: "Name is required." };
  if (data.kind === "sharedCode" || data.kind === "sharedLink") {
    if (!data.sharedValue?.trim()) {
      return { success: false, error: "A value is required for this coupon type." };
    }
  }

  const id = nanoid();
  const maxOrder = await getMaxSortOrder(eventId);
  const trimOrNull = (v?: string) => v?.trim() || undefined;

  const coupon: Coupon = {
    id,
    eventId,
    name: data.name.trim(),
    kind: data.kind,
    category: data.category.trim(),
    logoUrl: data.logoUrl.trim(),
    highlight: data.highlight.trim(),
    description: data.description.trim(),
    note: trimOrNull(data.note),
    sharedValue: trimOrNull(data.sharedValue),
    redeemUrl: trimOrNull(data.redeemUrl),
    sortOrder: data.sortOrder ?? maxOrder + 1,
    isDisabled: false,
    createdAt: new Date().toISOString(),
    ...(data.kind === "uniqueLink" ? { linkTotal: 0, linkAvailable: 0 } : {}),
  };

  await insertCoupon(coupon);

  await writeAuditLog({
    eventId,
    action: "coupon_created",
    metadata: { couponId: id, name: coupon.name, kind: coupon.kind },
    userId: session.uid,
  });

  // Grant this new coupon to all existing eligible attendees
  await assignPendingForEvent(eventId, emailConfig);

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

  const existing = await getCouponById(eventId, couponId);
  if (!existing) return { success: false, error: "Coupon not found." };

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.category !== undefined) update.category = data.category.trim();
  if (data.logoUrl !== undefined) update.logoUrl = data.logoUrl.trim();
  if (data.highlight !== undefined) update.highlight = data.highlight.trim();
  if (data.description !== undefined) update.description = data.description.trim();
  if (data.note !== undefined) update.note = data.note.trim() || null;
  if (data.sharedValue !== undefined) update.sharedValue = data.sharedValue.trim() || null;
  if (data.redeemUrl !== undefined) update.redeemUrl = data.redeemUrl.trim() || null;
  if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

  await updateCouponFields(eventId, couponId, update);

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

  const existingCoupons = await listCouponsForEvent(eventId);
  const existingIds = new Set(existingCoupons.map((c) => c.id));

  if (orderedIds.length !== existingIds.size) {
    return { success: false, error: "Coupon list is out of date. Refresh and try again." };
  }

  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      return { success: false, error: "Coupon list is out of date. Refresh and try again." };
    }
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    return { success: false, error: "Invalid coupon order." };
  }

  await reorderCouponsRepo(eventId, orderedIds);

  await writeAuditLog({
    eventId,
    action: "coupon_reordered",
    metadata: { orderedIds },
    userId: session.uid,
  });

  revalidatePath(`/events/${slug}/coupons`);
  return { success: true };
}

// ─── List partner logos from public/partner-logos ─────────────────────────────

export async function listPartnerLogos(): Promise<string[]> {
  await requireSession();

  const logosDir = path.join(process.cwd(), "public", "partner-logos");

  try {
    const entries = await readdir(logosDir, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          PARTNER_LOGO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      )
      .map((entry) => `/partner-logos/${entry.name}`)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

// ─── Toggle coupon disabled state ─────────────────────────────────────────────

export async function toggleCouponDisabled(
  eventId: string,
  couponId: string,
  disabled: boolean,
  slug: string,
  emailConfig?: EmailConfig
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const existing = await getCouponById(eventId, couponId);
  if (!existing) return { success: false, error: "Coupon not found." };

  await updateCouponFields(eventId, couponId, { isDisabled: disabled });

  await writeAuditLog({
    eventId,
    action: disabled ? "coupon_disabled" : "coupon_enabled",
    metadata: { couponId },
    userId: session.uid,
  });

  // When re-enabling, grant to any attendees who didn't get it yet
  if (!disabled) {
    await assignPendingForEvent(eventId, emailConfig);
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

  const coupon = await getCouponById(eventId, couponId);
  if (!coupon) return { success: false, error: "Coupon not found." };

  // ON DELETE CASCADE on coupon_links.coupon_id and grants.coupon_id handles
  // releasing/removing pool links and grants; the counter triggers on
  // attendees.grant_count / claimed_count fire per removed grant row.
  await deleteCouponCascade(eventId, couponId);

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
  slug: string,
  emailConfig?: EmailConfig
): Promise<{
  success: boolean;
  imported: number;
  invalidSkipped: number;
  autoGranted: number;
  errors: string[];
  error?: string;
}> {
  const session = await requireSession();

  const coupon = await getCouponById(eventId, couponId);
  if (!coupon) {
    return {
      success: false,
      imported: 0,
      invalidSkipped: 0,
      autoGranted: 0,
      errors: [],
      error: "Coupon not found.",
    };
  }

  if (coupon.kind !== "uniqueLink") {
    return {
      success: false,
      imported: 0,
      invalidSkipped: 0,
      autoGranted: 0,
      errors: [],
      error: "Only uniqueLink coupons have a link pool.",
    };
  }

  const { rows, invalidCount, errors } = parseCouponCsv(rawText);

  // Every uploaded link is treated as unique — no dedup against the file or
  // the existing pool, so a fresh row is created for each; linkTotal /
  // linkAvailable update automatically via the coupon_links trigger.
  const imported = await bulkInsertCouponLinks(
    rows.map((row) => ({
      id: nanoid(),
      couponId,
      eventId,
      url: row.couponLink,
    }))
  );

  await writeAuditLog({
    eventId,
    action: "coupon_links_added",
    metadata: { couponId, imported, invalid: invalidCount },
    userId: session.uid,
  });

  const autoGranted = imported > 0 ? await assignPendingForEvent(eventId, emailConfig) : 0;

  revalidatePath(`/events/${slug}/coupons`);

  return {
    success: true,
    imported,
    invalidSkipped: invalidCount,
    autoGranted,
    errors,
  };
}
