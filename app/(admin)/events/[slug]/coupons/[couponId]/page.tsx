import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Link2, Code, ExternalLink, Gift, Ban, Edit } from "lucide-react";
import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { getEventBySlug } from "../../../actions";
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
import { Attendee, Coupon, CouponLink, Grant } from "@/lib/types";
import CouponDetailTables, { LinkRow } from "./coupon-detail-tables";
import { EditCouponDialog } from "./edit-coupon-dialog";

type Props = { params: Promise<{ slug: string; couponId: string }> };

const kindConfig = {
  uniqueLink: { label: "Unique Link", icon: Link2, color: "text-blue-600" },
  sharedCode: { label: "Shared Code", icon: Code, color: "text-purple-600" },
  sharedLink: { label: "Shared Link", icon: ExternalLink, color: "text-green-600" },
} as const;

export default async function CouponDetailPage({ params }: Props) {
  await requireSession();
  const { slug, couponId } = await params;

  const event = await getEventBySlug(slug);
  if (!event) notFound();

  // Load coupon definition
  const couponSnap = await adminDb
    .collection("events")
    .doc(event.id)
    .collection("coupons")
    .doc(couponId)
    .get();

  if (!couponSnap.exists) notFound();
  const coupon = couponSnap.data() as Coupon;

  const KindCfg = kindConfig[coupon.kind];
  const KindIcon = KindCfg.icon;

  // ─── uniqueLink: load link pool + join attendee data ───────────────────────

  let linkRows: LinkRow[] = [];
  let linkStats = {
    total: 0,
    unassigned: 0,
    assigned: 0,
    claimed: 0,
    unclaimed: 0,
    disabled: 0,
    emailSentCount: 0,
    assignRate: 0,
    claimRate: 0,
  };

  if (coupon.kind === "uniqueLink") {
    const linksSnap = await adminDb
      .collection("events")
      .doc(event.id)
      .collection("coupons")
      .doc(couponId)
      .collection("links")
      .get();

    const rawLinks = linksSnap.docs.map((d) => d.data() as CouponLink);

    // Collect attendee IDs to batch-join names/emails
    const assignedToIds = [
      ...new Set(rawLinks.map((l) => l.assignedTo).filter(Boolean) as string[]),
    ];
    const attendeeInfoMap = new Map<string, { name: string; email: string; emailStatus: string }>();

    const CHUNK = 30;
    for (let i = 0; i < assignedToIds.length; i += CHUNK) {
      const chunk = assignedToIds.slice(i, i + CHUNK);
      const snap = await adminDb
        .collection("events")
        .doc(event.id)
        .collection("attendees")
        .where("id", "in", chunk)
        .get();
      snap.docs.forEach((d) => {
        const a = d.data() as Attendee;
        attendeeInfoMap.set(d.id, {
          name: a.name,
          email: a.email,
          emailStatus: a.emailStatus,
        });
      });
    }

    linkRows = rawLinks.map((l) => {
      const att = l.assignedTo ? attendeeInfoMap.get(l.assignedTo) : null;
      return {
        ...l,
        attendeeName: att?.name ?? null,
        attendeeEmail: att?.email ?? null,
      };
    });

    // Compute 6-card stats
    const total = rawLinks.length;
    const unassigned = rawLinks.filter((l) => l.status === "available" && !l.isDisabled).length;
    const assigned = rawLinks.filter((l) => l.status === "assigned").length;
    const claimed = rawLinks.filter((l) => l.status === "claimed").length;
    const unclaimed = assigned; // assigned but not claimed
    const disabled = rawLinks.filter((l) => l.isDisabled).length;
    const assignedTotal = assigned + claimed;
    const assignRate = total > 0 ? (assignedTotal / total) * 100 : 0;
    const claimRate = assignedTotal > 0 ? (claimed / assignedTotal) * 100 : 0;

    // Count "email sent" among assigned attendees
    const emailSentCount = rawLinks.filter((l) => {
      if (!l.assignedTo) return false;
      const att = attendeeInfoMap.get(l.assignedTo);
      return att?.emailStatus === "sent";
    }).length;

    linkStats = { total, unassigned, assigned, claimed, unclaimed, disabled, emailSentCount, assignRate, claimRate };
  }

  // ─── For sharedCode / sharedLink: load grants ─────────────────────────────

  const grantsSnap = await adminDb
    .collectionGroup("grants")
    .where("couponId", "==", couponId)
    .where("eventId", "==", event.id)
    .get();

  const grants = grantsSnap.docs.map((d) => d.data() as Grant);

  // Batch-fetch attendee names for grants (used for non-uniqueLink coupons)
  const grantAttendeeIds = [...new Set(grants.map((g) => g.attendeeId))];
  const grantAttendeeMap = new Map<string, { name: string; email: string }>();
  const CHUNK = 30;
  for (let i = 0; i < grantAttendeeIds.length; i += CHUNK) {
    const chunk = grantAttendeeIds.slice(i, i + CHUNK);
    const snap = await adminDb
      .collection("events")
      .doc(event.id)
      .collection("attendees")
      .where("id", "in", chunk)
      .get();
    snap.docs.forEach((d) => {
      grantAttendeeMap.set(d.id, { name: d.data().name, email: d.data().email });
    });
  }

  const grantsWithAttendee = grants
    .map((g) => {
      const att = grantAttendeeMap.get(g.attendeeId);
      return {
        ...g,
        attendeeName: att?.name ?? "—",
        attendeeEmail: att?.email ?? "—",
      };
    })
    .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));

  return (
    <div className="space-y-6">
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
            <EditCouponDialog eventId={event.id} eventSlug={slug} coupon={coupon} couponId={couponId} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {event.name} &middot;{" "}
            <Link href={`/events/${slug}/coupons`} className="hover:underline">
              All offers
            </Link>
          </p>
        </div>
      </div>

      {/* Stats row — 6 cards for uniqueLink, simpler for others */}
      {coupon.kind === "uniqueLink" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* Total */}
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

          {/* Unassigned */}
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs">Unassigned</CardDescription>
              <CardTitle className="text-3xl">{linkStats.unassigned}</CardTitle>
            </CardHeader>
            <CardContent className="pb-3 pt-0">
              <p className="text-xs text-muted-foreground">Ready to assign</p>
            </CardContent>
          </Card>

          {/* Assigned */}
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

          {/* Claimed */}
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

          {/* Unclaimed */}
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

          {/* Disabled */}
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
        // Simple 2-card stats for sharedCode / sharedLink
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Granted" value={grants.length} />
          <StatCard label="Claimed" value={grants.filter((g) => g.status === "claimed").length} />
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
        grants={grantsWithAttendee}
        eventId={event.id}
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
        <p className={`text-sm ${mono ? "font-mono" : ""} break-words`}>{value ?? "—"}</p>
      )}
    </div>
  );
}
