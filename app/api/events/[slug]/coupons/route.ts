import { NextResponse } from "next/server";
import { getEventBySlug } from "@/app/(admin)/events/actions";
import { getCoupons } from "@/app/(admin)/events/[slug]/coupons/coupon-data-actions";
import { getFriendlyFirestoreMessage } from "@/lib/firestore-errors";
import { CouponWithStats, Event } from "@/lib/types";

export interface CouponsData {
  notFound?: boolean;
  event?: Event;
  coupons?: CouponWithStats[];
  eventId?: string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const event = await getEventBySlug(slug);
    if (!event) {
      return NextResponse.json({ notFound: true } satisfies CouponsData);
    }
    const { coupons, eventId } = await getCoupons(slug);
    return NextResponse.json({ event, coupons, eventId } satisfies CouponsData);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error(`[api/events/${slug}/coupons] Failed to load coupons:`, error);
    return NextResponse.json(
      { error: "UNAVAILABLE", message: getFriendlyFirestoreMessage(error) },
      { status: 503 }
    );
  }
}
