import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAttendees } from "./attendee-data-actions";
import { getEventBySlug } from "../../actions";
import { isLumaApiConfigured } from "@/lib/luma";
import { getEmailQuota } from "@/lib/email";
import { Button } from "@/components/ui/button";
import {
  AttendeesProvider,
  AttendeesQuotaBadge,
  AttendeesTable,
} from "./attendees-client";
import { EventSectionNav } from "../event-section-nav";

// Bulk email sends run as Server Actions invoked from this page. Raise the
// default execution limit so larger batches have room to finish on platforms
// that honor maxDuration (e.g. Vercel). Client-side chunking keeps each call
// well under this ceiling.
export const maxDuration = 300;

type Props = { params: Promise<{ slug: string }> };

export default async function AttendeesPage({ params }: Props) {
  const { slug } = await params;
  const [event, { attendees, eventId }, quota] = await Promise.all([
    getEventBySlug(slug),
    getAttendees(slug),
    getEmailQuota(),
  ]);

  if (!event) notFound();

  return (
    <AttendeesProvider initialQuota={quota}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/events/${slug}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Attendees</h1>
              <p className="text-sm text-muted-foreground">
                {event.name} &middot; {attendees.length} attendee
                {attendees.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <AttendeesQuotaBadge />
        </div>

        <EventSectionNav slug={slug} active="attendees" />

        <AttendeesTable
          attendees={attendees}
          eventId={eventId}
          eventSlug={slug}
          initialLumaLastSyncedAt={event.lumaLastSyncedAt ?? null}
          lumaApiEnabled={isLumaApiConfigured()}
        />
      </div>
    </AttendeesProvider>
  );
}
