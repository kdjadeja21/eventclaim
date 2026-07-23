"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search, AlertCircle, Ban } from "lucide-react";
import { lookupAttendeeForClaim, type ClaimLookupResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Message = { tone: "error" | "info"; icon: "not_found" | "no_offers" | "blocked"; text: string };

const MESSAGES: Record<Exclude<ClaimLookupResult["status"], "ok">, Message> = {
  not_found: {
    tone: "info",
    icon: "not_found",
    text: "We couldn't find that email for this event. Make sure you're using the same address you registered with.",
  },
  no_offers: {
    tone: "info",
    icon: "no_offers",
    text: "No partner offers have been assigned to this email yet. Please check back a little later.",
  },
  blocked: {
    tone: "error",
    icon: "blocked",
    text: "This account can't claim offers right now. If you believe this is an error, please contact the event organizer.",
  },
  event_not_found: {
    tone: "error",
    icon: "not_found",
    text: "This event is no longer available.",
  },
};

export default function ClaimLookupForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setMessage(null);

    try {
      const res = await lookupAttendeeForClaim(slug, email.trim());
      if (res.status === "ok") {
        router.push(`/claim/${res.token}`);
        return; // keep the spinner while navigating
      }
      setMessage(MESSAGES[res.status]);
      setLoading(false);
    } catch {
      setMessage({
        tone: "error",
        icon: "not_found",
        text: "Something went wrong. Please try again.",
      });
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={loading}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Finding your offers…
          </>
        ) : (
          <>
            <Search className="h-4 w-4" />
            Find my offers
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      {message && (
        <div
          className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
            message.tone === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-zinc-200 bg-zinc-50 text-zinc-600"
          }`}
        >
          {message.icon === "blocked" ? (
            <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <p>{message.text}</p>
        </div>
      )}
    </form>
  );
}
