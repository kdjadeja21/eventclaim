"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { updateEventStatus } from "../actions";
import { hasTempTestAttendees } from "./attendees/test-attendee-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, Loader2 } from "lucide-react";
import { EventStatus } from "@/lib/types";

const statuses: { value: EventStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

export default function EventStatusButton({
  eventId,
  currentStatus,
  hasTestAttendees: initialHasTestAttendees = false,
}: {
  eventId: string;
  currentStatus: EventStatus;
  hasTestAttendees?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(currentStatus);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EventStatus | null>(null);

  async function applyStatus(status: EventStatus) {
    try {
      const result = await updateEventStatus(eventId, status);
      if (!result.success) {
        toast.error("Failed to update status");
        return;
      }
      setCurrent(status);
      setConfirmOpen(false);
      setPendingStatus(null);
      const label = statuses.find((s) => s.value === status)?.label ?? status;
      toast.success(`Status updated to ${label}`);
      router.refresh();
    } catch {
      toast.error("Failed to update status");
    }
  }

  function changeStatus(status: EventStatus) {
    if (status === current) return;

    startTransition(async () => {
      if (current === "draft" && status !== "draft") {
        const hasTest =
          initialHasTestAttendees || (await hasTempTestAttendees(eventId));
        if (hasTest) {
          setPendingStatus(status);
          setConfirmOpen(true);
          return;
        }
      }
      await applyStatus(status);
    });
  }

  function confirmLeaveDraft() {
    if (!pendingStatus) return;
    startTransition(async () => {
      await applyStatus(pendingStatus);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Change Status <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {statuses.map(({ value, label }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => changeStatus(value)}
              className={value === current ? "font-medium" : ""}
            >
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingStatus(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave draft and delete test data?</DialogTitle>
            <DialogDescription>
              This event has temp test attendees and fake Cursor Credits links.
              Changing status will permanently delete that test data.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false);
                setPendingStatus(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending || !pendingStatus}
              onClick={confirmLeaveDraft}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Confirm and continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
