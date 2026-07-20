import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { getEventBySlug } from "@/app/(admin)/events/actions";
import { getFriendlyFirestoreMessage } from "@/lib/firestore-errors";
import { Attendee, Coupon, CouponLink, Grant } from "@/lib/types";

export type LinkRow = CouponLink & {
  attendeeName: string | null;
  attendeeEmail: string | null;
};

export type GrantRow = Grant & { attendeeName: string; attendeeEmail: string };

export interface LinkStats {
  total: number;
  unassigned: number;
  assigned: number;
  claimed: number;
  unclaimed: number;
  disabled: number;
  emailSentCount: number;
  assignRate: number;
  claimRate: number;
}

export interface CouponDetailData {
  notFound?: boolean;
  coupon?: Coupon;
  eventId?: string;
  eventName?: string;
  linkRows?: LinkRow[];
  linkStats?: LinkStats;
  grants?: GrantRow[];
}

const CHUNK = 30;

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; couponId: string }> }
) {
  const { slug, couponId } = await context.params;

  try {
    await requireSession();

    const event = await getEventBySlug(slug);
    if (!event) {
      return NextResponse.json({ notFound: true } satisfies CouponDetailData);
    }

    const couponSnap = await adminDb
      .collection("events")
      .doc(event.id)
      .collection("coupons")
      .doc(couponId)
      .get();

    if (!couponSnap.exists) {
      return NextResponse.json({ notFound: true } satisfies CouponDetailData);
    }
    const coupon = couponSnap.data() as Coupon;

    let linkRows: LinkRow[] = [];
    let linkStats: LinkStats = {
      total: 0,
      unassigned: 0,
      assigned: 0,
      claimed: 0,
      unclaimed: 0,
      disabled: 0,
      emailSentCount: 0,
      assignRate: 0,
      claimRate: 0,
    };

    if (coupon.kind === "uniqueLink") {
      const linksSnap = await adminDb
        .collection("events")
        .doc(event.id)
        .collection("coupons")
        .doc(couponId)
        .collection("links")
        .get();

      const rawLinks = linksSnap.docs.map((d) => d.data() as CouponLink);

      const assignedToIds = [
        ...new Set(rawLinks.map((l) => l.assignedTo).filter(Boolean) as string[]),
      ];
      const attendeeInfoMap = new Map<
        string,
        { name: string; email: string; emailStatus: string }
      >();

      for (let i = 0; i < assignedToIds.length; i += CHUNK) {
        const chunk = assignedToIds.slice(i, i + CHUNK);
        const snap = await adminDb
          .collection("events")
          .doc(event.id)
          .collection("attendees")
          .where("id", "in", chunk)
          .get();
        snap.docs.forEach((d) => {
          const a = d.data() as Attendee;
          attendeeInfoMap.set(d.id, {
            name: a.name,
            email: a.email,
            emailStatus: a.emailStatus,
          });
        });
      }

      linkRows = rawLinks.map((l) => {
        const att = l.assignedTo ? attendeeInfoMap.get(l.assignedTo) : null;
        return {
          ...l,
          attendeeName: att?.name ?? null,
          attendeeEmail: att?.email ?? null,
        };
      });

      const total = rawLinks.length;
      const unassigned = rawLinks.filter(
        (l) => l.status === "available" && !l.isDisabled
      ).length;
      const assigned = rawLinks.filter((l) => l.status === "assigned").length;
      const claimed = rawLinks.filter((l) => l.status === "claimed").length;
      const unclaimed = assigned;
      const disabled = rawLinks.filter((l) => l.isDisabled).length;
      const assignedTotal = assigned + claimed;
      const assignRate = total > 0 ? (assignedTotal / total) * 100 : 0;
      const claimRate = assignedTotal > 0 ? (claimed / assignedTotal) * 100 : 0;

      const emailSentCount = rawLinks.filter((l) => {
        if (!l.assignedTo) return false;
        const att = attendeeInfoMap.get(l.assignedTo);
        return att?.emailStatus === "sent";
      }).length;

      linkStats = {
        total,
        unassigned,
        assigned,
        claimed,
        unclaimed,
        disabled,
        emailSentCount,
        assignRate,
        claimRate,
      };
    }

    const grantsSnap = await adminDb
      .collectionGroup("grants")
      .where("couponId", "==", couponId)
      .where("eventId", "==", event.id)
      .get();

    const grants = grantsSnap.docs.map((d) => d.data() as Grant);

    const grantAttendeeIds = [...new Set(grants.map((g) => g.attendeeId))];
    const grantAttendeeMap = new Map<string, { name: string; email: string }>();
    for (let i = 0; i < grantAttendeeIds.length; i += CHUNK) {
      const chunk = grantAttendeeIds.slice(i, i + CHUNK);
      const snap = await adminDb
        .collection("events")
        .doc(event.id)
        .collection("attendees")
        .where("id", "in", chunk)
        .get();
      snap.docs.forEach((d) => {
        grantAttendeeMap.set(d.id, {
          name: d.data().name,
          email: d.data().email,
        });
      });
    }

    const grantsWithAttendee: GrantRow[] = grants
      .map((g) => {
        const att = grantAttendeeMap.get(g.attendeeId);
        return {
          ...g,
          attendeeName: att?.name ?? "—",
          attendeeEmail: att?.email ?? "—",
        };
      })
      .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));

    return NextResponse.json({
      coupon,
      eventId: event.id,
      eventName: event.name,
      linkRows,
      linkStats,
      grants: grantsWithAttendee,
    } satisfies CouponDetailData);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error(
      `[api/events/${slug}/coupons/${couponId}] Failed to load coupon:`,
      error
    );
    return NextResponse.json(
      { error: "UNAVAILABLE", message: getFriendlyFirestoreMessage(error) },
      { status: 503 }
    );
  }
}
