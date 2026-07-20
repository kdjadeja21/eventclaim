import { NextResponse } from "next/server";
import { getEventBySlug } from "@/app/(admin)/events/actions";
import { getAttendees } from "@/app/(admin)/events/[slug]/attendees/attendee-data-actions";
import { isLumaApiConfigured } from "@/lib/luma";
import { getEmailQuota, type EmailQuota } from "@/lib/email";
import { getFriendlyFirestoreMessage } from "@/lib/firestore-errors";
import { Attendee } from "@/lib/types";

export interface AttendeesData {
  notFound?: boolean;
  eventName?: string;
  lumaLastSyncedAt?: string | null;
  attendees?: Attendee[];
  eventId?: string;
  quota?: EmailQuota;
  lumaApiEnabled?: boolean;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const event = await getEventBySlug(slug);
    if (!event) {
      return NextResponse.json({ notFound: true } satisfies AttendeesData);
    }

    const { attendees, eventId } = await getAttendees(slug);
    // Email quota comes from a third-party API and has its own fallback; never
    // let it take the attendee list down.
    const quota = await getEmailQuota().catch(() => ({
      limit: 0,
      used: 0,
      remaining: 0,
      ok: false,
    }));

    return NextResponse.json({
      eventName: event.name,
      lumaLastSyncedAt: event.lumaLastSyncedAt ?? null,
      attendees,
      eventId,
      quota,
      lumaApiEnabled: isLumaApiConfigured(),
    } satisfies AttendeesData);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    console.error(`[api/events/${slug}/attendees] Failed to load attendees:`, error);
    return NextResponse.json(
      { error: "UNAVAILABLE", message: getFriendlyFirestoreMessage(error) },
      { status: 503 }
    );
  }
}
