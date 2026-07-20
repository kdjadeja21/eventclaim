import { NextResponse } from "next/server";
import { getEventBySlug } from "@/app/(admin)/events/actions";
import { getEventStats } from "@/app/(admin)/events/[slug]/stats-actions";
import { getFriendlyFirestoreMessage } from "@/lib/firestore-errors";
import { Event, EventStats } from "@/lib/types";

export interface EventDetailData {
  notFound?: boolean;
  event?: Event;
  stats?: EventStats;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const event = await getEventBySlug(slug);
    if (!event) {
      return NextResponse.json({ notFound: true } satisfies EventDetailData);
    }
    const stats = await getEventStats(event.id);
    return NextResponse.json({ event, stats } satisfies EventDetailData);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error(`[api/events/${slug}] Failed to load event:`, error);
    return NextResponse.json(
      { error: "UNAVAILABLE", message: getFriendlyFirestoreMessage(error) },
      { status: 503 }
    );
  }
}
