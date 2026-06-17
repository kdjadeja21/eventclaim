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
    <div className="min-h-screen gradient-hero flex flex-col items-center justify-start px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full gradient-brand flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-xl">C</span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Check Your Coupon Status
          </h1>
          <p className="text-white/70 mt-2 text-sm">
            Enter the email address you registered with to check your Cursor
            credits status.
          </p>
        </div>

        {/* Search form */}
        <Card className="border-white/20 bg-white/95 backdrop-blur-sm shadow-xl">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
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
                    Check Status
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
          <Card className="border-white/20 bg-white/95 backdrop-blur-sm shadow-xl">
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
                    Attendance Status
                  </span>
                  <Badge variant="destructive">Not Checked In</Badge>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  Email Status
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
                  <span className="text-muted-foreground">Email Sent At</span>
                  <span className="text-xs">{formatDateTime(result.emailSentAt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Claim Status
                </span>
                <Badge variant={result.claimed ? "success" : "secondary"}>
                  {result.claimed ? "Claimed" : "Not Yet Claimed"}
                </Badge>
              </div>
              {result.claimedAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Claimed At</span>
                  <span className="text-xs">{formatDateTime(result.claimedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {result && !result.found && (
          <Card className="border-white/20 bg-white/95 backdrop-blur-sm shadow-xl">
            <CardContent className="pt-6 text-center text-sm text-muted-foreground space-y-2">
              <Clock className="h-8 w-8 mx-auto text-muted-foreground/50" />
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
    </div>
  );
}
