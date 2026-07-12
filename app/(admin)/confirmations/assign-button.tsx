"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Shuffle, Loader2 } from "lucide-react";
import { assignAttendeesAction } from "./assign-actions";
import { Button } from "@/components/ui/button";

export function AssignButton({ volunteerCount }: { volunteerCount: number }) {
  const [loading, setLoading] = useState(false);

  async function handleAssign() {
    setLoading(true);
    try {
      const res = await assignAttendeesAction();
      if (res.volunteerCount === 0) {
        toast.error("Add at least one active volunteer before assigning.");
        return;
      }
      toast.success(
        `Assigned ${res.totalAssigned} attendee${res.totalAssigned !== 1 ? "s" : ""} across ${res.volunteerCount} volunteer${res.volunteerCount !== 1 ? "s" : ""}`
      );
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assignment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleAssign} disabled={loading || volunteerCount === 0}>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Shuffle className="h-4 w-4" />
      )}
      Assign Attendees
    </Button>
  );
}
