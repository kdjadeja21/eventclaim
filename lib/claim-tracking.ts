import { writeAuditLog } from "@/lib/audit";
import { getAttendeeByClaimToken } from "@/lib/db/repos/attendees";
import { listCouponsWithStats } from "@/lib/db/repos/coupons";
import { getEventById } from "@/lib/db/repos/events";
import { claimGrant, getCouponNameAndKind, listGrantsForAttendee } from "@/lib/db/repos/grants";
import { CouponKind } from "@/lib/types";

export type GrantClaimSource = "copy" | "redeem_redirect";

export async function writeGrantClaimedAudit(params: {
  eventId: string;
  attendeeId: string;
  email: string;
  couponId: string;
  couponName: string;
  kind: CouponKind;
  claimedAt: string;
  source: GrantClaimSource;
  linkId?: string;
}): Promise<void> {
  const { eventId, attendeeId, email, couponId, couponName, kind, claimedAt, source, linkId } =
    params;

  await writeAuditLog({
    eventId,
    action: "grant_claimed",
    metadata: {
      attendeeId,
      email,
      couponId,
      couponName,
      kind,
      claimedAt,
      source,
      ...(linkId ? { linkId } : {}),
    },
  });
}

export async function getCouponClaimMetadata(
  eventId: string,
  couponId: string
): Promise<{ couponName: string; kind: CouponKind }> {
  return getCouponNameAndKind(eventId, couponId);
}

/**
 * Marks a grant as claimed (idempotent) and writes the audit log on first
 * claim. Shared by both the claim page action and the /redeem redirect
 * route, which used to duplicate this exact transaction.
 */
export async function markGrantClaimedByToken(
  token: string,
  couponId: string,
  source: GrantClaimSource
): Promise<{ success: boolean; error?: string; found?: boolean; targetValue?: string | null }> {
  const attendee = await getAttendeeByClaimToken(token);
  if (!attendee) return { success: false, error: "Invalid token." };

  try {
    const result = await claimGrant({
      eventId: attendee.eventId,
      attendeeId: attendee.id,
      couponId,
    });

    if (result.newlyClaimed) {
      const { couponName, kind } = await getCouponClaimMetadata(attendee.eventId, couponId);
      await writeGrantClaimedAudit({
        eventId: attendee.eventId,
        attendeeId: attendee.id,
        email: attendee.email,
        couponId,
        couponName,
        kind,
        claimedAt: new Date().toISOString(),
        source,
        linkId: result.linkId ?? undefined,
      });
    }

    return { success: true, found: result.found, targetValue: result.value };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to mark claimed.",
    };
  }
}

/**
 * Loads all grants + coupon defs + event + attendee for the claim landing
 * page.
 */
export async function getClaimPageData(token: string): Promise<
  | {
      found: false;
      reason: "invalid_token" | "attendee_not_found";
    }
  | {
      found: true;
      attendee: import("@/lib/types").Attendee;
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
  const attendee = await getAttendeeByClaimToken(token);
  if (!attendee) return { found: false, reason: "invalid_token" };

  const event = await getEventById(attendee.eventId);
  if (!event) return { found: false, reason: "attendee_not_found" };

  const attendeeGrants = await listGrantsForAttendee(attendee.eventId, attendee.id);

  const eventSummary = {
    name: event.name,
    date: event.date,
    tagline: event.tagline,
    description: event.description,
    timeLabel: event.timeLabel,
    venue: event.venue,
  };

  if (attendeeGrants.length === 0) {
    return { found: true, attendee, event: eventSummary, grants: [] };
  }

  const coupons = await listCouponsWithStats(attendee.eventId);
  const couponMap = new Map(coupons.map((c) => [c.id, c]));

  const grants = attendeeGrants
    .map((g) => {
      const coupon = couponMap.get(g.couponId);
      if (!coupon) return null;
      return {
        couponId: g.couponId,
        value: g.value,
        status: g.status as "assigned" | "claimed",
        coupon: {
          name: coupon.name,
          kind: coupon.kind,
          category: coupon.category,
          logoUrl: coupon.logoUrl,
          highlight: coupon.highlight,
          description: coupon.description,
          note: coupon.note,
          redeemUrl: coupon.redeemUrl,
          isDisabled: coupon.isDisabled,
          sortOrder: coupon.sortOrder,
        },
      };
    })
    .filter((g): g is NonNullable<typeof g> => g !== null)
    .sort((a, b) => a.coupon.sortOrder - b.coupon.sortOrder);

  return { found: true, attendee, event: eventSummary, grants };
}
