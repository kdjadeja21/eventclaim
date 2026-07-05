import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { isLumaApiConfigured } from "@/lib/luma";
import { Button } from "@/components/ui/button";
import { EventSectionNav } from "../event-section-nav";
import { getTeamsPageData, TeamsDataError } from "./team-data-actions";
import TeamTable from "./team-table";

type Props = { params: Promise<{ slug: string }> };

export const maxDuration = 300;

export default async function TeamsPage({ params }: Props) {
  const { slug } = await params;

  let pageData;
  try {
    pageData = await getTeamsPageData(slug);
  } catch (err) {
    if (err instanceof TeamsDataError && err.code === "quota_exceeded") {
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/events/${slug}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          </div>
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-3">
            <div className="flex items-center gap-2 text-destructive font-medium">
              <AlertCircle className="h-5 w-5" />
              Firestore quota exceeded
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {err.message} The teams page now loads data in smaller batches to
              reduce reads — wait a few minutes for your quota to reset, then
              refresh.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/events/${slug}`}>Back to event</Link>
            </Button>
          </div>
        </div>
      );
    }
    if (err instanceof TeamsDataError && err.code === "not_found") {
      notFound();
    }
    throw err;
  }

  const { event } = pageData;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/events/${slug}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground">
            {event.name} &middot; {pageData.stats.formedTeams} formed team
            {pageData.stats.formedTeams !== 1 ? "s" : ""} &middot;{" "}
            {pageData.stats.poolCount} in pool &middot;{" "}
            {pageData.stats.totalRegistrations} registration
            {pageData.stats.totalRegistrations !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <EventSectionNav slug={slug} active="teams" />

      <TeamTable
        teams={pageData.teams}
        teamRegistrations={pageData.teamRegistrations}
        eventSlug={slug}
        eventId={pageData.eventId}
        event={pageData.event}
        lumaApiEnabled={isLumaApiConfigured()}
        lumaEventId={event.lumaEventId ?? null}
        initialLumaLastSyncedAt={event.lumaLastSyncedAt ?? null}
        stats={pageData.stats}
      />
    </div>
  );
}
