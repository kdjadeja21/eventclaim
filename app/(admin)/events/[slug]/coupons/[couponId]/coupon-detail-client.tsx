"use client";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Link2, Code, ExternalLink, Gift, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useCachedData } from "@/hooks/use-cached-data";
import { cacheKeys } from "@/lib/cache-keys";
import { DataUnavailable } from "@/components/data-unavailable";
import { StaleDataBanner } from "@/components/stale-data-banner";
import type { CouponDetailData } from "@/app/api/events/[slug]/coupons/[couponId]/route";
import CouponDetailTables from "./coupon-detail-tables";
import { EditCouponDialog } from "./edit-coupon-dialog";

const kindConfig = {
  uniqueLink: { label: "Unique Link", icon: Link2, color: "text-blue-600" },
  sharedCode: { label: "Shared Code", icon: Code, color: "text-purple-600" },
  sharedLink: { label: "Shared Link", icon: ExternalLink, color: "text-green-600" },
} as const;

function CouponDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-12 mt-1" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

export default function CouponDetailClient({
  slug,
  couponId,
}: {
  slug: string;
  couponId: string;
}) {
  const { data, cachedAt, isStale, loading, refresh } =
    useCachedData<CouponDetailData>(
      cacheKeys.coupon(slug, couponId),
      `/api/events/${slug}/coupons/${couponId}`
    );

  if (loading && !data) return <CouponDetailLoading />;

  if (data?.notFound) notFound();

  if (
    !data ||
    !data.coupon ||
    !data.eventId ||
    !data.linkStats ||
    !data.linkRows ||
    !data.grants
  ) {
    return (
      <DataUnavailable
        title="This offer is temporarily unavailable"
        onRetry={refresh}
      />
    );
  }

  const { coupon, eventId, eventName, linkRows, linkStats, grants } = data;
  const KindCfg = kindConfig[coupon.kind];
  const KindIcon = KindCfg.icon;

  return (
    <div className="space-y-6">
      {isStale && <StaleDataBanner cachedAt={cachedAt} />}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/events/${slug}/coupons`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {coupon.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coupon.logoUrl}
                alt={coupon.name}
                className={`h-7 w-auto max-w-[80px] object-contain ${coupon.logoUrl.includes("cursor_logo.svg") ? "[filter:brightness(0)]" : ""}`}
              />
            ) : (
              <div className="h-7 w-7 rounded bg-muted flex items-center justify-center">
                <Gift className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <h1 className="text-2xl font-semibold tracking-tight">{coupon.name}</h1>
            <Badge variant="outline" className="gap-1 font-normal">
              <KindIcon className={`h-3.5 w-3.5 ${KindCfg.color}`} />
              {KindCfg.label}
            </Badge>
            {coupon.category && (
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {coupon.category}
              </span>
            )}
            {coupon.isDisabled && (
              <Badge variant="destructive" className="gap-1">
                <Ban className="h-3 w-3" />
                Disabled
              </Badge>
            )}
            <EditCouponDialog
              eventId={eventId}
              eventSlug={slug}
              coupon={coupon}
              couponId={couponId}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {eventName} &middot;{" "}
            <Link href={`/events/${slug}/coupons`} className="hover:underline">
              All offers
            </Link>
          </p>
        </div>
      </div>

      {/* Stats row — 6 cards for uniqueLink, simpler for others */}
      {coupon.kind === "uniqueLink" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Total Coupons</CardDescription>
              <CardTitle className="text-3xl">{linkStats.total}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0 space-y-1">
              <Progress value={linkStats.assignRate} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {linkStats.assignRate.toFixed(0)}% assign rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Unassigned</CardDescription>
              <CardTitle className="text-3xl">{linkStats.unassigned}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-xs text-muted-foreground">Ready to assign</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Assigned</CardDescription>
              <CardTitle className="text-3xl">{linkStats.assigned}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-xs text-muted-foreground">
                {linkStats.emailSentCount > 0
                  ? `${linkStats.emailSentCount} email sent`
                  : "No emails sent yet"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Claimed</CardDescription>
              <CardTitle className="text-3xl">{linkStats.claimed}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0 space-y-1">
              <Progress value={linkStats.claimRate} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {linkStats.claimRate.toFixed(0)}% claim rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Unclaimed</CardDescription>
              <CardTitle className="text-3xl">{linkStats.unclaimed}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-xs text-muted-foreground">
                Assigned but not yet claimed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Disabled</CardDescription>
              <CardTitle className="text-3xl">{linkStats.disabled}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-xs text-muted-foreground">
                Not available for assignment
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Granted" value={grants.length} />
          <StatCard
            label="Claimed"
            value={grants.filter((g) => g.status === "claimed").length}
          />
        </div>
      )}

      {/* Coupon details card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Offer Details</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
          <Detail label="Highlight" value={coupon.highlight} />
          <Detail label="Description" value={coupon.description} />
          {coupon.note && <Detail label="Note" value={coupon.note} />}
          {coupon.sharedValue && (
            <Detail
              label={coupon.kind === "sharedCode" ? "Promo Code" : "Shared URL"}
              value={coupon.sharedValue}
              mono={coupon.kind === "sharedCode"}
            />
          )}
          {coupon.redeemUrl && (
            <Detail label="Redeem Guide">
              <a
                href={coupon.redeemUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {coupon.redeemUrl}
              </a>
            </Detail>
          )}
        </CardContent>
      </Card>

      {/* Interactive table — link pool (uniqueLink) or read-only grants (others) */}
      <CouponDetailTables
        coupon={coupon}
        links={linkRows}
        grants={grants}
        eventId={eventId}
        eventSlug={slug}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className={`text-3xl ${highlight ? "text-amber-500" : ""}`}>
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function Detail({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
        {label}
      </p>
      {children ?? (
        <p className={`text-sm ${mono ? "font-mono" : ""} break-words`}>
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}
