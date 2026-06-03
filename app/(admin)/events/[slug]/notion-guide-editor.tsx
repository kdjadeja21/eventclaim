"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateEventSettings } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, Loader2, Pencil } from "lucide-react";

export default function NotionGuideEditor({
  eventId,
  notionGuideUrl,
}: {
  eventId: string;
  notionGuideUrl: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [url, setUrl] = useState(notionGuideUrl);
  const [draftUrl, setDraftUrl] = useState(notionGuideUrl);
  const [isPending, startTransition] = useTransition();

  function startEditing() {
    setDraftUrl(url);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDraftUrl(url);
    setIsEditing(false);
  }

  function saveUrl() {
    startTransition(async () => {
      const result = await updateEventSettings(eventId, {
        notionGuideUrl: draftUrl.trim(),
      });

      if (!result.success) {
        toast.error(result.error ?? "Failed to save guide link");
        return;
      }

      setUrl(draftUrl.trim());
      setIsEditing(false);
      toast.success("Guide link saved");
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Claim Guide
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Step-by-step Notion link included in claim emails when set
            </CardDescription>
          </div>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={startEditing}
              disabled={isPending}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              {url ? "Edit" : "Add link"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isEditing ? (
          <div className="space-y-3">
            <Input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://notion.so/..."
              disabled={isPending}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveUrl} disabled={isPending}>
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEditing}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline underline-offset-4 hover:no-underline break-all"
          >
            {url}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">
            No guide link yet. Add your Notion step-by-step guide so attendees
            can find it in their claim email.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
