"use client";

import { useState } from "react";
import { Search, CheckCircle2, Clock, Mail, CalendarDays, Loader2, Ban } from "lucide-react";
import { checkAttendeeStatus } from "./status-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import SiteCreditFooter from "@/components/site-credit-footer";
import { BrandMarkIcon } from "@/components/brand-mark";

type StatusResult = Awaited<ReturnType<typeof checkAttendeeStatus>>;

export default function CheckStatusPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await checkAttendeeStatus(email.trim().toLowerCase());
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="gradient-hero flex min-h-screen flex-col items-center px-4 pt-16">
      <div className="w-full max-w-md flex-1 space-y-6">
        <div className="text-left">
          <div className="mb-4">
            <BrandMarkIcon size="lg" className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Check your coupon status
          </h1>
          <p className="text-white/65 mt-2 text-sm">
            Enter the email address you registered with to check your Cursor
            credits status.
          </p>
        </div>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    Check status
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-4 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        )}

        {result && result.found && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                {result.eventName}
              </CardTitle>
              <CardDescription>{result.eventDate}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {result.isBlacklisted && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Ban className="h-3.5 w-3.5" />
                    Attendance status
                  </span>
                  <Badge variant="destructive">Not checked in</Badge>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Email status
                </span>
                <Badge
                  variant={
                    result.emailSent
                      ? "success"
                      : "secondary"
                  }
                >
                  {result.emailSent ? "Sent" : "Pending"}
                </Badge>
              </div>
              {result.emailSentAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Email sent at</span>
                  <span className="text-xs">{formatDateTime(result.emailSentAt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Offers granted
                </span>
                <Badge variant={(result.grantCount ?? 0) > 0 ? "success" : "secondary"}>
                  {result.grantCount ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Claim status
                </span>
                <Badge variant={result.claimed ? "success" : "secondary"}>
                  {result.claimed ? "Claimed" : "Not yet claimed"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {result && !result.found && (
          <Card className="border-border bg-card">
            <CardContent className="pt-6 text-left text-sm text-muted-foreground space-y-2">
              <Clock className="h-8 w-8 text-muted-foreground/50" />
              <p>
                No record found for <strong>{email}</strong>.
              </p>
              <p className="text-xs">
                Make sure you are using the same email you registered with. If
                you believe this is an error, please contact the event organizer.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <SiteCreditFooter tone="dark" />
    </div>
  );
}
