"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setAutoSendEmail } from "../actions";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail, Loader2 } from "lucide-react";

export default function AutoSendToggle({
  eventId,
  autoSendEmail,
}: {
  eventId: string;
  autoSendEmail: boolean;
}) {
  const [enabled, setEnabled] = useState(autoSendEmail);
  const [isPending, startTransition] = useTransition();

  function handleToggle(checked: boolean) {
    const previous = enabled;
    setEnabled(checked);

    startTransition(async () => {
      const result = await setAutoSendEmail(eventId, checked);

      if (!result.success) {
        setEnabled(previous);
        toast.error(result.error ?? "Failed to update auto-send setting");
        return;
      }

      toast.success(
        checked
          ? "Auto-send enabled — new attendees will be emailed automatically"
          : "Auto-send disabled — emails must be sent manually"
      );
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Auto-send emails
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Automatically email attendees as soon as they receive their
              coupon(s) — no manual sending needed
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isPending && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={isPending}
              aria-label="Toggle auto-send emails"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {enabled
            ? "When attendees are imported or synced and receive offers, their claim email is sent automatically — one at a time."
            : "Emails are not sent automatically. Use the Attendees page or Preview & Send to email attendees manually."}
        </p>
      </CardContent>
    </Card>
  );
}
