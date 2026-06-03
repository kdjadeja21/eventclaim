import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAttendees } from "./attendee-data-actions";
import { getEventBySlug } from "../../actions";
import { Button } from "@/components/ui/button";
import AttendeeTable from "./attendee-table";

// Bulk email sends run as Server Actions invoked from this page. Raise the
// default execution limit so larger batches have room to finish on platforms
// that honor maxDuration (e.g. Vercel). Client-side chunking keeps each call
// well under this ceiling.
export const maxDuration = 300;

type Props = { params: Promise<{ slug: string }> };

export default async function AttendeesPage({ params }: Props) {
  const { slug } = await params;
  const [event, { attendees, eventId }] = await Promise.all([
    getEventBySlug(slug),
    getAttendees(slug),
  ]);

  if (!event) notFound();

  return (
    <div className="space-y-6">
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

      <AttendeeTable
        attendees={attendees}
        eventId={eventId}
        eventSlug={slug}
      />
    </div>
  );
}
