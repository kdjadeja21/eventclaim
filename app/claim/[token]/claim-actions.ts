"use server";

import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { Attendee, ClaimToken, Grant } from "@/lib/types";

/**
 * Marks a grant as claimed (idempotent).
 * Updates attendee.claimedAny and the grant.status.
 */
export async function markGrantClaimed(
  token: string,
  couponId: string
): Promise<{ success: boolean; error?: string }> {
  const tokenDoc = await adminDb.collection("claimTokens").doc(token).get();
  if (!tokenDoc.exists) return { success: false, error: "Invalid token." };

  const { eventId, attendeeId } = tokenDoc.data() as ClaimToken;

  const grantRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId)
    .collection("grants")
    .doc(couponId);

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  try {
    await adminDb.runTransaction(async (txn) => {
      const [grantSnap, attendeeSnap] = await Promise.all([
        txn.get(grantRef),
        txn.get(attendeeRef),
      ]);

      if (!grantSnap.exists || !attendeeSnap.exists) return;
      const grant = grantSnap.data() as Grant;
      if (grant.status === "claimed") return; // idempotent

      const now = new Date().toISOString();
      txn.update(grantRef, { status: "claimed", claimedAt: now });
      txn.update(attendeeRef, { claimedAny: true });

      // If uniqueLink, also mark the pool link as claimed
      if (grant.linkId) {
        const linkRef = adminDb
          .collection("events")
          .doc(eventId)
          .collection("coupons")
          .doc(couponId)
          .collection("links")
          .doc(grant.linkId);
        txn.update(linkRef, { status: "claimed", claimedAt: now });
      }
    });

    await writeAuditLog({
      eventId,
      action: "grant_claimed",
      metadata: { attendeeId, couponId },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to mark claimed.",
    };
  }
}

/**
 * Loads all grants + coupon defs + event + attendee for the landing page.
 */
export async function getClaimPageData(token: string): Promise<
  | {
      found: false;
      reason: "invalid_token" | "attendee_not_found";
    }
  | {
      found: true;
      attendee: Attendee;
      event: {
        name: string;
        date: string;
        tagline?: string;
        description?: string;
        timeLabel?: string;
        venue?: string;
      };
      grants: Array<{
        couponId: string;
        value: string;
        status: "assigned" | "claimed";
        coupon: {
          name: string;
          kind: "uniqueLink" | "sharedCode" | "sharedLink";
          category: string;
          logoUrl: string;
          highlight: string;
          description: string;
          note?: string;
          redeemUrl?: string;
          isDisabled: boolean;
          sortOrder: number;
        };
      }>;
    }
> {
  const tokenDoc = await adminDb.collection("claimTokens").doc(token).get();
  if (!tokenDoc.exists) return { found: false, reason: "invalid_token" };

  const { eventId, attendeeId } = tokenDoc.data() as ClaimToken;

  const [attendeeSnap, eventSnap, grantsSnap] = await Promise.all([
    adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .doc(attendeeId)
      .get(),
    adminDb.collection("events").doc(eventId).get(),
    adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .doc(attendeeId)
      .collection("grants")
      .get(),
  ]);

  if (!attendeeSnap.exists) return { found: false, reason: "attendee_not_found" };

  const attendee = attendeeSnap.data() as Attendee;
  const eventData = eventSnap.data()!;

  if (grantsSnap.empty) {
    return {
      found: true,
      attendee,
      event: {
        name: eventData.name,
        date: eventData.date,
        tagline: eventData.tagline,
        description: eventData.description,
        timeLabel: eventData.timeLabel,
        venue: eventData.venue,
      },
      grants: [],
    };
  }

  // Fetch coupon definitions for each grant
  const couponIds = [...new Set(grantsSnap.docs.map((d) => d.data().couponId as string))];

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
      .map((d) => [d.id, d.data()!])
  );

  const grants = grantsSnap.docs
    .map((d) => {
      const g = d.data() as Grant;
      const c = couponMap.get(g.couponId);
      if (!c) return null;
      return {
        couponId: g.couponId,
        value: g.value,
        status: g.status,
        coupon: {
          name: c.name as string,
          kind: c.kind as "uniqueLink" | "sharedCode" | "sharedLink",
          category: (c.category as string) ?? "",
          logoUrl: (c.logoUrl as string) ?? "",
          highlight: (c.highlight as string) ?? "",
          description: (c.description as string) ?? "",
          note: c.note as string | undefined,
          redeemUrl: c.redeemUrl as string | undefined,
          isDisabled: (c.isDisabled as boolean) ?? false,
          sortOrder: (c.sortOrder as number) ?? 0,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => a!.coupon.sortOrder - b!.coupon.sortOrder) as Array<{
    couponId: string;
    value: string;
    status: "assigned" | "claimed";
    coupon: {
      name: string;
      kind: "uniqueLink" | "sharedCode" | "sharedLink";
      category: string;
      logoUrl: string;
      highlight: string;
      description: string;
      note?: string;
      redeemUrl?: string;
      isDisabled: boolean;
      sortOrder: number;
    };
  }>;

  return {
    found: true,
    attendee,
    event: {
      name: eventData.name,
      date: eventData.date,
      tagline: eventData.tagline,
      description: eventData.description,
      timeLabel: eventData.timeLabel,
      venue: eventData.venue,
    },
    grants,
  };
}
