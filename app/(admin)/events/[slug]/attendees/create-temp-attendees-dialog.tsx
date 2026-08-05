"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createTempAttendees } from "./test-attendee-actions";

type PersonForm = { name: string; email: string };

const EMPTY_PERSON: PersonForm = { name: "", email: "" };

export default function CreateTempAttendeesDialog({
  open,
  onOpenChange,
  eventId,
  eventSlug,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  eventSlug: string;
  onCreated: () => void;
}) {
  const [person1, setPerson1] = useState<PersonForm>(EMPTY_PERSON);
  const [person2, setPerson2] = useState<PersonForm>(EMPTY_PERSON);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPerson1(EMPTY_PERSON);
    setPerson2(EMPTY_PERSON);
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createTempAttendees(eventId, eventSlug, [
        person1,
        person2,
      ]);
      if (!result.success) {
        toast.error(result.error ?? "Failed to create temp attendees");
        return;
      }
      toast.success("Temp attendees and fake Cursor Credits links created");
      reset();
      onOpenChange(false);
      onCreated();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create temp users</DialogTitle>
          <DialogDescription>
            Create two draft-only test attendees with fake Cursor Credits links
            so you can send and verify claim emails. Names are stored with a{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">test_</code>{" "}
            prefix.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {([
            { label: "Temp user 1", value: person1, set: setPerson1 },
            { label: "Temp user 2", value: person2, set: setPerson2 },
          ] as const).map((slot) => (
            <div key={slot.label} className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">{slot.label}</p>
              <div className="space-y-2">
                <Label htmlFor={`${slot.label}-name`}>Name</Label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-muted-foreground font-mono">
                    test_
                  </span>
                  <Input
                    id={`${slot.label}-name`}
                    value={
                      slot.value.name.toLowerCase().startsWith("test_")
                        ? slot.value.name.slice(5)
                        : slot.value.name
                    }
                    onChange={(e) =>
                      slot.set({ ...slot.value, name: e.target.value })
                    }
                    placeholder="alice"
                    required
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${slot.label}-email`}>Email</Label>
                <Input
                  id={`${slot.label}-email`}
                  type="email"
                  value={slot.value.email}
                  onChange={(e) =>
                    slot.set({ ...slot.value, email: e.target.value })
                  }
                  placeholder="you@example.com"
                  required
                  disabled={isPending}
                />
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Create temp users
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
