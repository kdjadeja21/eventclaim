"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCachedData } from "@/hooks/use-cached-data";
import { cacheKeys } from "@/lib/cache-keys";
import { DataUnavailable } from "@/components/data-unavailable";
import { StaleDataBanner } from "@/components/stale-data-banner";
import type { CouponsData } from "@/app/api/events/[slug]/coupons/route";
import CouponList from "./coupon-list";
import { EventSectionNav } from "../event-section-nav";
import CouponsLoading from "./loading";

export default function CouponsClient({ slug }: { slug: string }) {
  const { data, cachedAt, isStale, loading, refresh } = useCachedData<CouponsData>(
    cacheKeys.coupons(slug),
    `/api/events/${slug}/coupons`
  );

  if (loading && !data) return <CouponsLoading />;

  if (data?.notFound) notFound();

  if (!data || !data.event || !data.coupons || !data.eventId) {
    return (
      <DataUnavailable
        title="Partner offers are temporarily unavailable"
        onRetry={refresh}
      />
    );
  }

  const { event, coupons, eventId } = data;

  return (
    <div className="space-y-6">
      {isStale && <StaleDataBanner cachedAt={cachedAt} />}

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/events/${slug}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Partner Offers
          </h1>
          <p className="text-sm text-muted-foreground">
            {event.name} &middot; {coupons.length} offer
            {coupons.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <EventSectionNav slug={slug} active="coupons" />

      <CouponList coupons={coupons} eventId={eventId} eventSlug={slug} />
    </div>
  );
}
