"use server";

import { requireSession } from "@/lib/session";
import { requireAccessibleEventById } from "@/lib/auth/event-access";
import { writeAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { ensureClaimToken } from "@/lib/assignment-helpers";
import { getGrant, reserveSpecificLinkGrant, reserveUniqueLinkGrant, unassignGrant } from "@/lib/db/repos/grants";
import {
  deleteAvailableLink,
  getLink,
  listAvailableLinks,
  listUnassignedAttendees,
  setLinkDisabled,
} from "@/lib/db/repos/links";
import { setEmailStatus } from "@/lib/db/repos/attendees";

function detailPath(slug: string, couponId: string) {
  return `/events/${slug}/coupons/${couponId}`;
}

// ─── Auto-assign: pick the next available link for an attendee ────────────────

export async function autoAssignLink(
  eventId: string,
  couponId: string,
  attendeeId: string,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  await requireAccessibleEventById(eventId);

  const existingGrant = await getGrant(eventId, attendeeId, couponId);
  if (existingGrant) {
    return { success: false, error: "Attendee already has a grant for this coupon." };
  }

  const available = await listAvailableLinks(eventId, couponId);
  if (available.length === 0) {
    return { success: false, error: "No available links in pool." };
  }

  const assigned = await reserveUniqueLinkGrant({ eventId, attendeeId, couponId });
  if (!assigned) {
    return { success: false, error: "No available links could be reserved." };
  }

  await ensureClaimToken(eventId, attendeeId);
  // grant_count is maintained by the grants_after_change trigger — no manual
  // increment needed here, unlike the old FieldValue.increment(1) call.
  await setEmailStatus(eventId, attendeeId, "pending");

  await writeAuditLog({
    eventId,
    action: "coupon_granted",
    metadata: { couponId, attendeeId, manual: false },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
}

// ─── Assign a specific link to an attendee ────────────────────────────────────

export async function assignSpecificLink(
  eventId: string,
  couponId: string,
  linkId: string,
  attendeeId: string,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  await requireAccessibleEventById(eventId);

  const existingGrant = await getGrant(eventId, attendeeId, couponId);
  if (existingGrant) {
    return { success: false, error: "Attendee already has a grant for this coupon." };
  }

  const assigned = await reserveSpecificLinkGrant({ eventId, attendeeId, couponId, linkId });
  if (!assigned) {
    return { success: false, error: "Link is no longer available." };
  }

  await ensureClaimToken(eventId, attendeeId);
  await setEmailStatus(eventId, attendeeId, "pending");

  await writeAuditLog({
    eventId,
    action: "coupon_granted",
    metadata: { couponId, attendeeId, linkId, manual: true },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
}

// ─── Unassign a link (release back to available pool) ─────────────────────────

export async function unassignLink(
  eventId: string,
  couponId: string,
  linkId: string,
  attendeeId: string,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  await requireAccessibleEventById(eventId);

  const link = await getLink(eventId, couponId, linkId);
  if (!link) return { success: false, error: "Link not found." };
  if (link.status === "claimed") {
    return { success: false, error: "Cannot unassign a claimed link." };
  }

  await unassignGrant(eventId, attendeeId, couponId, linkId);

  await writeAuditLog({
    eventId,
    action: "coupon_unassigned",
    metadata: { couponId, attendeeId, linkId },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
}

// ─── Delete a link from the pool (available only) ─────────────────────────────

export async function deleteLink(
  eventId: string,
  couponId: string,
  linkId: string,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  await requireAccessibleEventById(eventId);

  const link = await getLink(eventId, couponId, linkId);
  if (!link) return { success: false, error: "Link not found." };
  if (link.status !== "available") {
    return { success: false, error: "Only available (unassigned) links can be deleted." };
  }

  const deleted = await deleteAvailableLink(eventId, couponId, linkId);
  if (!deleted) return { success: false, error: "Link is no longer available." };

  await writeAuditLog({
    eventId,
    action: "coupon_link_deleted",
    metadata: { couponId, linkId },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
}

// ─── Toggle a single link's disabled state ────────────────────────────────────

export async function toggleLinkDisabled(
  eventId: string,
  couponId: string,
  linkId: string,
  disabled: boolean,
  eventSlug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  await requireAccessibleEventById(eventId);

  const updated = await setLinkDisabled(eventId, couponId, linkId, disabled);
  if (!updated) return { success: false, error: "Link not found." };

  await writeAuditLog({
    eventId,
    action: disabled ? "coupon_disabled" : "coupon_enabled",
    metadata: { couponId, linkId },
    userId: session.uid,
  });

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true };
}

// ─── Bulk auto-assign: assign all available links to attendees without a grant ─

export async function bulkAutoAssignLinks(
  eventId: string,
  couponId: string,
  eventSlug: string
): Promise<{ success: boolean; assigned: number; error?: string }> {
  await requireSession();

  await requireAccessibleEventById(eventId);

  const unassigned = await getUnassignedAttendees(eventId, couponId);
  if (unassigned.length === 0) {
    return { success: true, assigned: 0 };
  }

  let assigned = 0;
  for (const attendee of unassigned) {
    const res = await autoAssignLink(eventId, couponId, attendee.id, eventSlug);
    if (res.success) assigned++;
    else if (
      res.error === "No available links in pool." ||
      res.error === "No available links could be reserved."
    ) {
      break; // pool exhausted
    }
  }

  revalidatePath(detailPath(eventSlug, couponId));
  return { success: true, assigned };
}

// ─── Data queries ─────────────────────────────────────────────────────────────

export async function getUnassignedAttendees(
  eventId: string,
  couponId: string
): Promise<Array<{ id: string; name: string; email: string }>> {
  await requireSession();
  await requireAccessibleEventById(eventId);

  return listUnassignedAttendees(eventId, couponId);
}

export async function getAvailableLinks(
  eventId: string,
  couponId: string
): Promise<Array<{ id: string; url: string }>> {
  await requireSession();
  await requireAccessibleEventById(eventId);

  return listAvailableLinks(eventId, couponId);
}
