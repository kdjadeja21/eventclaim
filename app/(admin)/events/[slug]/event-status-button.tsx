"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateEventStatus } from "../actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
}: {
  eventId: string;
  currentStatus: EventStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(currentStatus);

  function changeStatus(status: EventStatus) {
    if (status === current) return;
    startTransition(async () => {
      try {
        const res = await updateEventStatus(eventId, status);
        if (!res.success) {
          toast.error(res.error ?? "Failed to update status");
          return;
        }
        setCurrent(status);
        const label = statuses.find((s) => s.value === status)?.label ?? status;
        toast.success(`Status updated to ${label}`);
      } catch {
        toast.error("Failed to update status");
      }
    });
  }

  return (
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
  );
}
