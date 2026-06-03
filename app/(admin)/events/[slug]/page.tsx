import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Users,
  Ticket,
  Mail,
  BarChart2,
  Upload,
  Send,
} from "lucide-react";
import { getEventBySlug } from "../actions";
import { getEventStats } from "./stats-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";
import { Event } from "@/lib/types";
import EventStatusButton from "./event-status-button";
import NotionGuideEditor from "./notion-guide-editor";

const statusVariant: Record<
  Event["status"],
  "default" | "success" | "secondary"
> = {
  draft: "secondary",
  active: "success",
  completed: "default",
};

type Props = { params: Promise<{ slug: string }> };

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();

  const stats = await getEventStats(event.id);

  const quickLinks = [
    {
      href: `/events/${slug}/import`,
      label: "Import Attendees / Coupons",
      icon: Upload,
      description: "Upload Luma CSV or coupon links",
    },
    {
      href: `/events/${slug}/attendees`,
      label: "Manage Attendees",
      icon: Users,
      description: "View, search, filter, and send emails",
    },
    {
      href: `/events/${slug}/coupons`,
      label: "Manage Coupons",
      icon: Ticket,
      description: "Assign, unassign, add, and track coupons",
    },
    {
      href: `/events/${slug}/preview`,
      label: "Preview & Send",
      icon: Send,
      description: "Validate and send all pending emails",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/events">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">
              {event.name}
            </h1>
            <Badge
              variant={statusVariant[event.status]}
              className="capitalize"
            >
              {event.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDate(event.date)} &middot; /{event.slug}
          </p>
        </div>
        <EventStatusButton eventId={event.id} currentStatus={event.status} />
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Attendees"
          value={stats.totalAttendees}
          sub={`${stats.totalAssigned} assigned`}
        />
        <StatCard
          icon={Ticket}
          label="Coupons"
          value={stats.totalCoupons}
          sub={`${stats.totalAvailable} available`}
        />
        <StatCard
          icon={Mail}
          label="Emails Sent"
          value={stats.totalEmailsSent}
          sub={`${stats.totalEmailsPending} pending`}
        />
        <StatCard
          icon={BarChart2}
          label="Claim Rate"
          value={`${stats.claimRate.toFixed(1)}%`}
          sub={`${stats.totalClaimed} / ${stats.totalAssigned} claimed`}
          progress={stats.claimRate}
        />
      </div>

      {/* Quick links */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map(({ href, label, icon: Icon, description }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-sm">{label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs">
                  {description}
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Notion guide */}
      <NotionGuideEditor
        key={event.notionGuideUrl}
        eventId={event.id}
        notionGuideUrl={event.notionGuideUrl}
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
