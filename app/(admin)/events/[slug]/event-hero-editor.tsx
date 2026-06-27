"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Globe } from "lucide-react";
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
import { updateEventHero } from "../actions";

export default function EventHeroEditor({
  eventId,
  tagline,
  description,
  timeLabel,
  venue,
}: {
  eventId: string;
  tagline?: string;
  description?: string;
  timeLabel?: string;
  venue?: string;
}) {
  const [form, setForm] = useState({
    tagline: tagline ?? "",
    description: description ?? "",
    timeLabel: timeLabel ?? "",
    venue: venue ?? "",
  });
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const res = await updateEventHero(eventId, form);
      if (res.success) {
        toast.success("Claim page hero updated.");
      } else {
        toast.error(res.error ?? "Failed to update.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          Claim Page Hero
        </CardTitle>
        <CardDescription className="text-xs">
          These fields populate the headline, description, and event info cards
          on the attendee claim landing page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="hero-tagline">Headline</Label>
          <Input
            id="hero-tagline"
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            placeholder="Build together, claim your credits."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hero-desc">Description</Label>
          <Input
            id="hero-desc"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="A morning of building with fellow developers…"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="hero-time">Time</Label>
            <Input
              id="hero-time"
              value={form.timeLabel}
              onChange={(e) =>
                setForm((f) => ({ ...f, timeLabel: e.target.value }))
              }
              placeholder="10:00 – 14:00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hero-venue">Venue</Label>
            <Input
              id="hero-venue"
              value={form.venue}
              onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
              placeholder="Trekanten, Oslo"
            />
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Hero
        </Button>
      </CardContent>
    </Card>
  );
}
