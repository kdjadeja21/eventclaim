"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function WelcomeDialog({
  open,
  onStartTour,
  onSkip,
}: {
  open: boolean;
  onStartTour: () => void;
  onSkip: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle>Welcome to EventClaim</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Send Cursor credits and partner offers to event guests by email.
            Take a short tour, or explore on your own — every page also has a
            Tour this page button for local tips.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onSkip}>
            I&apos;ll explore on my own
          </Button>
          <Button type="button" onClick={onStartTour}>
            Walk me through it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
