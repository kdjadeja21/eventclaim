"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Shuffle, Loader2 } from "lucide-react";
import { assignAttendeesAction } from "./assign-actions";
import { Button } from "@/components/ui/button";

export function AssignButton({ volunteerCount }: { volunteerCount: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAssign() {
    setLoading(true);
    try {
      const res = await assignAttendeesAction();
      if (res.volunteerCount === 0) {
        toast.error("Add at least one active volunteer before assigning.");
        return;
      }
      if (res.totalAssigned === 0) {
        toast.message(
          "Nothing new to assign — all eligible attendees already have a volunteer."
        );
      } else {
        toast.success(
          `Assigned ${res.totalAssigned} attendee${res.totalAssigned !== 1 ? "s" : ""} across ${res.volunteerCount} volunteer${res.volunteerCount !== 1 ? "s" : ""}`
        );
      }
      router.refresh();
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
