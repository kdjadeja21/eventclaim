"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createEvent } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

type ActionState = Awaited<ReturnType<typeof createEvent>> | null;

export default function NewEventPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createEvent,
    null
  );

  useEffect(() => {
    if (state?.success && state.slug) {
      toast.success("Event created");
      router.push(`/events/${state.slug}`);
    }
  }, [state, router]);

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/events">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Event</h1>
          <p className="text-sm text-muted-foreground">
            Create a new coupon distribution event
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Event Details</CardTitle>
          <CardDescription>
            Fill in the details for your event. A slug will be auto-generated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Event Name *</Label>
              <Input
                id="name"
                name="name"
                placeholder="Cursor Workshop Rajkot"
                required
              />
              {state?.errors?.name && (
                <p className="text-xs text-destructive">
                  {state.errors.name[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Event Date *</Label>
              <Input id="date" name="date" type="date" required />
              {state?.errors?.date && (
                <p className="text-xs text-destructive">
                  {state.errors.date[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notionGuideUrl">Notion Claim Guide URL</Label>
              <Input
                id="notionGuideUrl"
                name="notionGuideUrl"
                type="url"
                placeholder="https://notion.so/..."
              />
              {state?.errors?.notionGuideUrl && (
                <p className="text-xs text-destructive">
                  {state.errors.notionGuideUrl[0]}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="draft">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Claim Page Hero (optional)
              </p>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="tagline">Headline</Label>
                  <Input
                    id="tagline"
                    name="tagline"
                    placeholder="Build together, claim your credits."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    name="description"
                    placeholder="A morning of building with fellow developers…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="timeLabel">Time</Label>
                    <Input
                      id="timeLabel"
                      name="timeLabel"
                      placeholder="10:00 – 14:00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="venue">Venue</Label>
                    <Input
                      id="venue"
                      name="venue"
                      placeholder="Trekanten, Oslo"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  "Create Event"
                )}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/events">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
