"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2, TriangleAlert } from "lucide-react";
import { deleteEvent } from "../actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function DeleteEventButton({
  eventId,
  eventName,
}: {
  eventId: string;
  eventName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  const confirmed = confirmText === eventName;

  function handleOpenChange(next: boolean) {
    if (!isPending) {
      setOpen(next);
      if (!next) setConfirmText("");
    }
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteEvent(eventId);
      if (result.success) {
        toast.success(`"${eventName}" and all its data have been deleted.`);
        setOpen(false);
        router.push("/events");
      } else {
        toast.error(result.error ?? "Delete failed. Please try again.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4" />
          Delete Event
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            Delete event permanently?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-1">
              <p>
                This will permanently delete{" "}
                <span className="font-medium text-foreground">
                  &ldquo;{eventName}&rdquo;
                </span>{" "}
                and{" "}
                <span className="font-medium text-foreground">
                  all associated data
                </span>
                , including:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>All attendees and their coupon assignments</li>
                <li>All coupons</li>
                <li>All claim tokens (existing claim links will stop working)</li>
                <li>All email logs</li>
              </ul>
              <p className="font-medium text-destructive">
                This action cannot be undone.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="confirm-name" className="text-sm">
            Type{" "}
            <span className="font-mono font-semibold">{eventName}</span> to
            confirm
          </Label>
          <Input
            id="confirm-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={eventName}
            disabled={isPending}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!confirmed || isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Delete Event
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
