"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useCachedData } from "@/hooks/use-cached-data";
import { cacheKeys } from "@/lib/cache-keys";
import { DataUnavailable } from "@/components/data-unavailable";
import { StaleDataBanner } from "@/components/stale-data-banner";
import type { AttendeesData } from "@/app/api/events/[slug]/attendees/route";
import {
  AttendeesProvider,
  AttendeesQuotaBadge,
  AttendeesTable,
} from "./attendees-client";
import { EventSectionNav } from "../event-section-nav";

function AttendeesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-2xl rounded-md" />
      <Card>
        <CardContent className="pt-4 divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="py-3 flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded-sm" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AttendeesPageClient({ slug }: { slug: string }) {
  const { data, cachedAt, isStale, loading, refresh } =
    useCachedData<AttendeesData>(
      cacheKeys.attendees(slug),
      `/api/events/${slug}/attendees`
    );

  if (loading && !data) return <AttendeesLoading />;

  if (data?.notFound) notFound();

  if (
    !data ||
    !data.attendees ||
    !data.eventId ||
    !data.quota ||
    data.eventName === undefined
  ) {
    return (
      <DataUnavailable
        title="Attendees are temporarily unavailable"
        onRetry={refresh}
      />
    );
  }

  const { eventName, attendees, eventId, quota, lumaLastSyncedAt, lumaApiEnabled } =
    data;

  return (
    <AttendeesProvider initialQuota={quota}>
      <div className="space-y-6">
        {isStale && <StaleDataBanner cachedAt={cachedAt} />}

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
                {eventName} &middot; {attendees.length} attendee
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
          initialLumaLastSyncedAt={lumaLastSyncedAt ?? null}
          lumaApiEnabled={lumaApiEnabled ?? false}
        />
      </div>
    </AttendeesProvider>
  );
}
