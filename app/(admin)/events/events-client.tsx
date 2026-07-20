"use client";

import Link from "next/link";
import { Plus, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { useCachedData } from "@/hooks/use-cached-data";
import { cacheKeys } from "@/lib/cache-keys";
import { DataUnavailable } from "@/components/data-unavailable";
import { StaleDataBanner } from "@/components/stale-data-banner";
import { Event } from "@/lib/types";
import type { EventsData } from "@/app/api/events/route";
import EventsLoading from "./loading";

const statusVariant: Record<
  Event["status"],
  "default" | "success" | "secondary"
> = {
  draft: "secondary",
  active: "success",
  completed: "default",
};

export default function EventsClient() {
  const { data, cachedAt, isStale, loading, refresh } = useCachedData<EventsData>(
    cacheKeys.events,
    "/api/events"
  );

  if (loading && !data) return <EventsLoading />;

  const events = data?.events ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage coupon distribution events
          </p>
        </div>
        <Button asChild>
          <Link href="/events/new">
            <Plus className="h-4 w-4" />
            New Event
          </Link>
        </Button>
      </div>

      {isStale && <StaleDataBanner cachedAt={cachedAt} />}

      {!events ? (
        <DataUnavailable
          title="Events are temporarily unavailable"
          onRetry={refresh}
        />
      ) : events.length === 0 ? (
        <Card className="py-16">
          <CardContent className="flex flex-col items-center justify-center gap-3 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">No events yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first event to get started.
            </p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/events/new">
                <Plus className="h-4 w-4" />
                Create Event
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <Link key={event.id} href={`/events/${event.slug}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-snug">
                      {event.name}
                    </CardTitle>
                    <Badge
                      variant={statusVariant[event.status]}
                      className="shrink-0 capitalize"
                    >
                      {event.status}
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center gap-1 mt-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(event.date)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground font-mono">
                    /{event.slug}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
