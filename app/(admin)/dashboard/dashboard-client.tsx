"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Users,
  Ticket,
  Mail,
  TrendingUp,
  ArrowRight,
  Clock,
  CheckCheck,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/utils";
import { readLocalCache, writeLocalCache } from "@/lib/local-cache";
import type { DashboardData } from "@/app/api/dashboard/route";
import DashboardLoading from "./loading";

const CACHE_KEY = "eventclaim_dashboard_cache_v1";

const actionLabels: Record<string, string> = {
  event_created: "Event created",
  event_updated: "Event updated",
  event_hero_updated: "Hero updated",
  attendee_imported: "Attendees imported",
  attendee_deleted: "Attendee deleted",
  coupon_created: "Coupon created",
  coupon_updated: "Coupon updated",
  coupon_deleted: "Coupon deleted",
  coupon_reordered: "Coupons reordered",
  coupon_links_added: "Links added",
  coupon_granted: "Grants issued",
  grant_claimed: "Offer claimed",
  email_sent: "Email sent",
  email_resent: "Email resent",
  email_failed: "Email failed",
  status_checked: "Status checked",
};

export default function DashboardClient() {
  // Intentionally start with no data on both server and client so the very
  // first render (and hydration) is identical; the localStorage cache is a
  // browser-only API and is applied in the effect below right after mount.
  const [data, setData] = useState<DashboardData | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const cached = readLocalCache<DashboardData>(CACHE_KEY);

    async function load() {
      // Synchronizing with the browser's localStorage cache (an external
      // system not derived from props/state), so applying it here is safe.
      if (cached && !cancelled) {
        setData(cached.data);
        setCachedAt(cached.cachedAt);
        setLoading(false);
      }

      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed with ${res.status}`);
        const fresh = (await res.json()) as DashboardData;
        if (cancelled) return;
        setData(fresh);
        setCachedAt(new Date().toISOString());
        setIsStale(false);
        writeLocalCache(CACHE_KEY, fresh);
      } catch {
        // Firestore is unavailable (e.g. quota exceeded) — fall back to
        // whatever we already had cached instead of showing an error page.
        if (cancelled) return;
        if (cached) setIsStale(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !data) return <DashboardLoading />;

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground text-sm">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <p>Dashboard data is temporarily unavailable.</p>
          <p className="text-xs">Please try again in a moment.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight gradient-text">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overview across all events
        </p>
      </div>

      {isStale && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            Showing cached data from{" "}
            {cachedAt ? formatDateTime(cachedAt) : "earlier"} — live data is
            temporarily unavailable.
          </span>
        </div>
      )}

      {/* Global stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={CalendarDays}
          label="Total Events"
          value={data.perEventStats.length}
        />
        <StatCard icon={Users} label="Total Attendees" value={data.totalAttendees} />
        <StatCard icon={Ticket} label="Total Coupons" value={data.totalCoupons} />
        <StatCard icon={Mail} label="Emails Sent" value={data.totalEmailsSent} />
        <StatCard
          icon={TrendingUp}
          label="Overall Claim Rate"
          value={`${data.overallClaimRate.toFixed(1)}%`}
          progress={data.overallClaimRate}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Per-event summary */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold gradient-text uppercase tracking-wider">
            Events
          </h2>
          {data.perEventStats.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
                <Layers className="h-5 w-5" />
                No events yet.{" "}
                <Link href="/events/new" className="text-primary underline">
                  Create one
                </Link>
              </CardContent>
            </Card>
          ) : (
            data.perEventStats.map(
              ({ event, attendees, granted, sent, claimed, claimRate }) => (
                <Card key={event.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm">{event.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {event.date}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          event.status === "active"
                            ? "success"
                            : event.status === "draft"
                            ? "secondary"
                            : "default"
                        }
                        className="capitalize"
                      >
                        {event.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <Metric label="Attendees" value={attendees} />
                      <Metric label="Granted" value={granted} />
                      <Metric label="Sent" value={sent} />
                      <Metric label="Claimed" value={claimed} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={claimRate} className="flex-1 h-1.5" />
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {claimRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-end">
                      <Link
                        href={`/events/${event.slug}`}
                        className="text-xs text-primary flex items-center gap-0.5 hover:underline"
                      >
                        View event
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            )
          )}
        </div>

        {/* Recent Activity */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold gradient-text uppercase tracking-wider">
            Recent Activity
          </h2>
          <Card>
            <CardContent className="pt-4">
              {data.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No activity yet.
                </p>
              ) : (
                <div className="space-y-0 divide-y">
                  {data.recentActivity.map((item) => (
                    <div key={item.id} className="py-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <ActionIcon action={item.action} />
                        <span className="flex-1">
                          {actionLabels[item.action] ?? item.action}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                        {formatDateTime(item.timestamp)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <Separator className="my-3" />
              <Link
                href="/audit"
                className="text-xs text-primary flex items-center gap-0.5 hover:underline"
              >
                View all audit logs
                <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  progress,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  progress?: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2 text-xs">
          <span className="flex h-7 w-7 items-center justify-center rounded-md gradient-brand shadow-sm">
            <Icon className="h-3.5 w-3.5 text-white" />
          </span>
          {label}
        </CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {progress !== undefined && (
        <CardContent>
          <Progress value={progress} className="h-1.5" />
        </CardContent>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-base font-semibold">{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}

function ActionIcon({ action }: { action: string }) {
  const iconMap: Record<string, React.ElementType> = {
    email_sent: Mail,
    email_resent: Mail,
    grant_claimed: CheckCheck,
    attendee_imported: Users,
    coupon_created: Ticket,
    coupon_links_added: Ticket,
    coupon_granted: Ticket,
    event_created: CalendarDays,
  };
  const Icon = iconMap[action] ?? Clock;
  return <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}
