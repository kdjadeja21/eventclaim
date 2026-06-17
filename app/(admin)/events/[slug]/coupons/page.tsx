import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Ticket, CheckCheck, PackageOpen, BarChart2, CircleDot, Ban } from "lucide-react";
import { getCoupons } from "./coupon-data-actions";
import { getEventBySlug } from "../../actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import CouponTable from "./coupon-table";
import { EventSectionNav } from "../event-section-nav";

type Props = { params: Promise<{ slug: string }> };

export default async function CouponsPage({ params }: Props) {
  const { slug } = await params;
  const [event, { coupons, eventId, stats }] = await Promise.all([
    getEventBySlug(slug),
    getCoupons(slug),
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Manage Coupons
          </h1>
          <p className="text-sm text-muted-foreground">
            {event.name} &middot; {stats.total} coupon
            {stats.total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <EventSectionNav slug={slug} active="coupons" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={Ticket}
          label="Total Coupons"
          value={stats.total}
          sub={`${stats.assignRate.toFixed(0)}% assign rate`}
          progress={stats.assignRate}
        />
        <StatCard
          icon={PackageOpen}
          label="Unassigned"
          value={stats.available}
          sub="Ready to assign"
        />
        <StatCard
          icon={CircleDot}
          label="Assigned"
          value={stats.assigned + stats.emailSent}
          sub={`${stats.emailSent} email sent`}
        />
        <StatCard
          icon={CheckCheck}
          label="Claimed"
          value={stats.claimed}
          sub={`${stats.claimRate.toFixed(0)}% claim rate`}
          progress={stats.claimRate}
        />
        <StatCard
          icon={BarChart2}
          label="Unclaimed"
          value={stats.unclaimed}
          sub="Assigned but not yet claimed"
        />
        <StatCard
          icon={Ban}
          label="Disabled"
          value={stats.disabled}
          sub="Not available for assignment"
        />
      </div>

      <CouponTable
        coupons={coupons}
        eventId={eventId}
        eventSlug={slug}
        stats={stats}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  progress,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
  progress?: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{sub}</p>
        {progress !== undefined && (
          <Progress value={progress} className="mt-2 h-1.5" />
        )}
      </CardContent>
    </Card>
  );
}
