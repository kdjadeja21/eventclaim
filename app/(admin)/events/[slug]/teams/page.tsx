import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getEventBySlug } from "../../actions";
import { isLumaApiConfigured } from "@/lib/luma";
import { Button } from "@/components/ui/button";
import { EventSectionNav } from "../event-section-nav";
import { getTeamsPageData } from "./team-data-actions";
import TeamTable from "./team-table";

type Props = { params: Promise<{ slug: string }> };

export default async function TeamsPage({ params }: Props) {
  const { slug } = await params;
  const [event, pageData] = await Promise.all([
    getEventBySlug(slug),
    getTeamsPageData(slug),
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
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground">
            {event.name} &middot; {pageData.stats.totalTeams} team
            {pageData.stats.totalTeams !== 1 ? "s" : ""} &middot;{" "}
            {pageData.registrations.length} registration
            {pageData.registrations.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <EventSectionNav slug={slug} active="teams" />

      <TeamTable
        teams={pageData.teams}
        registrations={pageData.registrations}
        eventSlug={slug}
        eventId={pageData.eventId}
        lumaApiEnabled={isLumaApiConfigured()}
        lumaEventId={event.lumaEventId ?? null}
        initialLumaLastSyncedAt={event.lumaLastSyncedAt ?? null}
        stats={pageData.stats}
      />
    </div>
  );
}
