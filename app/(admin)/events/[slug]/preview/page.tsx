"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, AlertTriangle, Loader2, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getPreviewStats } from "./preview-actions";
import { bulkSendPending, bulkResendFailed } from "../attendees/email-actions";

type Props = { params: Promise<{ slug: string }> };

type Stats = {
  eventId: string;
  totalAttendees: number;
  couponsAvailable: number;
  couponsAssigned: number;
  emailsToSend: number;
  emailsFailed: number;
  missingCoupons: number;
  canSend: boolean;
};

export default function PreviewPage({ params: paramsPromise }: Props) {
  const [slug, setSlug] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    paramsPromise.then(async (p) => {
      setSlug(p.slug);
      const s = await getPreviewStats(p.slug);
      setStats(s);
      setLoading(false);
    });
  }, [paramsPromise]);

  function handleSendPending() {
    if (!stats) return;
    startTransition(async () => {
      const result = await bulkSendPending(stats.eventId);
      if (result.failed > 0) {
        toast.warning(`Sent: ${result.sent} · Failed: ${result.failed} · Skipped: ${result.skipped}`);
      } else {
        toast.success(`${result.sent} email${result.sent !== 1 ? "s" : ""} sent successfully`);
      }
      const s = await getPreviewStats(slug);
      setStats(s);
    });
  }

  function handleResendFailed() {
    if (!stats) return;
    startTransition(async () => {
      const result = await bulkResendFailed(stats.eventId);
      if (result.failed > 0) {
        toast.warning(`Resent: ${result.sent} · Still failed: ${result.failed}`);
      } else {
        toast.success(`${result.sent} email${result.sent !== 1 ? "s" : ""} resent successfully`);
      }
      const s = await getPreviewStats(slug);
      setStats(s);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/events/${slug}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Preview & Send
          </h1>
          <p className="text-sm text-muted-foreground">
            Validate before sending coupon emails
          </p>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : stats ? (
        <>
          {/* Validation status */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                {stats.canSend ? (
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                )}
                <CardTitle className="text-lg">
                  {stats.canSend
                    ? "Safe to Proceed"
                    : "Issues Found — Review Before Sending"}
                </CardTitle>
              </div>
              {!stats.canSend && (
                <CardDescription className="text-amber-600">
                  {stats.missingCoupons} attendee(s) do not have coupons
                  assigned. Upload more coupons or resolve before sending.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <StatRow
                label="Total Attendees"
                value={stats.totalAttendees}
              />
              <Separator />
              <StatRow
                label="Coupons Available"
                value={stats.couponsAvailable}
                badge={stats.couponsAvailable > 0 ? "success" : "warning"}
              />
              <StatRow
                label="Coupons Assigned"
                value={stats.couponsAssigned}
                badge="success"
              />
              <StatRow
                label="Attendees Missing Coupons"
                value={stats.missingCoupons}
                badge={stats.missingCoupons === 0 ? "success" : "warning"}
              />
              <Separator />
              <StatRow
                label="Emails To Send (Pending)"
                value={stats.emailsToSend}
                badge={stats.emailsToSend > 0 ? "info" : "secondary"}
              />
              <StatRow
                label="Emails Failed"
                value={stats.emailsFailed}
                badge={stats.emailsFailed === 0 ? "secondary" : "destructive"}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSendPending}
              disabled={!stats.canSend || stats.emailsToSend === 0 || isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send {stats.emailsToSend} Pending Email
              {stats.emailsToSend !== 1 ? "s" : ""}
            </Button>

            {stats.emailsFailed > 0 && (
              <Button
                variant="outline"
                onClick={handleResendFailed}
                disabled={isPending}
              >
                <RefreshCw className="h-4 w-4" />
                Resend {stats.emailsFailed} Failed Email
                {stats.emailsFailed !== 1 ? "s" : ""}
              </Button>
            )}
          </div>

        </>
      ) : (
        <p className="text-muted-foreground text-sm">Event not found.</p>
      )}
    </div>
  );
}

type BadgeVariant = "success" | "secondary" | "warning" | "destructive" | "info" | "default";

function StatRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: number;
  badge?: BadgeVariant;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {badge ? (
        <Badge variant={badge}>{value}</Badge>
      ) : (
        <span className="font-medium">{value}</span>
      )}
    </div>
  );
}
