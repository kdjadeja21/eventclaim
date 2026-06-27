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
} from "lucide-react";
import { adminDb } from "@/lib/firebase/admin";
import { getEventCountStats } from "@/lib/event-stats";
import { requireSession } from "@/lib/session";
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
import { Event } from "@/lib/types";

async function getDashboardData() {
  await requireSession();

  const eventsSnap = await adminDb
    .collection("events")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  const events = eventsSnap.docs.map((d) => d.data() as Event);

  const eventStatsResults = await Promise.all(
    events.map(async (event) => {
      const stats = await getEventCountStats(event.id);
      return { event, stats };
    })
  );

  let totalAttendees = 0;
  let totalCouponDefs = 0;
  let totalGranted = 0;
  let totalEmailsSent = 0;
  let totalClaimed = 0;

  const perEventStats = eventStatsResults.map(({ event, stats }) => {
    totalAttendees += stats.totalAttendees;
    totalCouponDefs += stats.totalCouponDefs;
    totalGranted += stats.totalGranted;
    totalEmailsSent += stats.totalEmailsSent;
    totalClaimed += stats.totalClaimed;

    return {
      event,
      attendees: stats.totalAttendees,
      granted: stats.totalGranted,
      sent: stats.totalEmailsSent,
      claimed: stats.totalClaimed,
      claimRate: stats.claimRate,
    };
  });

  // Recent audit logs
  const auditSnap = await adminDb
    .collection("auditLogs")
    .orderBy("timestamp", "desc")
    .limit(5)
    .get();

  const recentActivity = auditSnap.docs.map((d) => ({
    id: d.id,
    action: d.data().action as string,
    timestamp: d.data().timestamp as string,
    eventId: d.data().eventId as string | null,
    metadata: d.data().metadata as Record<string, unknown>,
  }));

  return {
    totalAttendees,
    totalCoupons: totalCouponDefs,
    totalGranted,
    totalEmailsSent,
    totalClaimed,
    overallClaimRate:
      totalGranted > 0 ? (totalClaimed / totalGranted) * 100 : 0,
    perEventStats,
    recentActivity,
  };
}

const actionLabels: Record<string, string> = {
  event_created: "Event created",
  event_updated: "Event updated",
  event_hero_updated: "Hero updated",
  attendee_imported: "Attendees imported",
  attendee_deleted: "Attendee deleted",
  coupon_created: "Coupon created",
  coupon_updated: "Coupon updated",
  coupon_deleted: "Coupon deleted",
  coupon_links_added: "Links added",
  coupon_granted: "Grants issued",
  grant_claimed: "Offer claimed",
  email_sent: "Email sent",
  email_resent: "Email resent",
  email_failed: "Email failed",
  status_checked: "Status checked",
};

export default async function DashboardPage() {
  const data = await getDashboardData();

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
