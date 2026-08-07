import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Link2, Code, ExternalLink, Gift, Ban, Edit } from "lucide-react";
import { requireSession } from "@/lib/session";
import { getEventBySlug } from "../../../actions";
import {
  getCouponById,
  listGrantsForCouponWithAttendee,
  listLinksForCoupon,
} from "@/lib/db/repos/coupons";
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
import { Grant } from "@/lib/types";
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

  const coupon = await getCouponById(event.id, couponId);
  if (!coupon) notFound();

  const KindCfg = kindConfig[coupon.kind];
  const KindIcon = KindCfg.icon;

  // ─── uniqueLink: load link pool (already joined with attendee data) ──────

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
    const joinedRows = await listLinksForCoupon(event.id, couponId);

    linkRows = joinedRows.map((r) => ({
      id: r.link.id,
      couponId: r.link.couponId,
      eventId: r.link.eventId,
      url: r.link.url,
      status: r.link.status as LinkRow["status"],
      assignedTo: r.link.assignedTo,
      assignedAt: r.link.assignedAt,
      claimedAt: r.link.claimedAt,
      isDisabled: r.link.isDisabled,
      attendeeName: r.attendeeName ?? null,
      attendeeEmail: r.attendeeEmail ?? null,
    }));

    const rows = joinedRows.map((r) => r.link);
    const total = rows.length;
    const unassigned = rows.filter((l) => l.status === "available" && !l.isDisabled).length;
    const assigned = rows.filter((l) => l.status === "assigned").length;
    const claimed = rows.filter((l) => l.status === "claimed").length;
    const unclaimed = assigned;
    const disabled = rows.filter((l) => l.isDisabled).length;
    const assignedTotal = assigned + claimed;
    const assignRate = total > 0 ? (assignedTotal / total) * 100 : 0;
    const claimRateVal = assignedTotal > 0 ? (claimed / assignedTotal) * 100 : 0;

    const emailSentCount = joinedRows.filter(
      (r) => !!r.link.assignedTo && r.attendeeEmailStatus === "sent"
    ).length;

    linkStats = {
      total,
      unassigned,
      assigned,
      claimed,
      unclaimed,
      disabled,
      emailSentCount,
      assignRate,
      claimRate: claimRateVal,
    };
  }

  // ─── For sharedCode / sharedLink: load grants ─────────────────────────────

  const grantRows = await listGrantsForCouponWithAttendee(event.id, couponId);
  const grants: Grant[] = grantRows.map((r) => ({
    couponId: r.couponId,
    eventId: r.eventId,
    attendeeId: r.attendeeId,
    value: r.value,
    linkId: r.linkId ?? undefined,
    status: r.status as Grant["status"],
    assignedAt: r.assignedAt,
    claimedAt: r.claimedAt,
  }));

  const grantsWithAttendee = grantRows
    .map((r) => ({
      couponId: r.couponId,
      eventId: r.eventId,
      attendeeId: r.attendeeId,
      value: r.value,
      linkId: r.linkId ?? undefined,
      status: r.status as Grant["status"],
      assignedAt: r.assignedAt,
      claimedAt: r.claimedAt,
      attendeeName: r.attendeeName ?? "—",
      attendeeEmail: r.attendeeEmail ?? "—",
    }))
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
