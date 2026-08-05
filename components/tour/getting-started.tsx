"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  Circle,
  HelpCircle,
  ListChecks,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChecklistStep } from "@/lib/tour/progress";

function ChecklistBody({
  steps,
  completedRequired,
  totalRequired,
  onDismiss,
  onReplayTour,
}: {
  steps: ChecklistStep[];
  completedRequired: number;
  totalRequired: number;
  onDismiss: () => void;
  onReplayTour: () => void;
}) {
  const firstIncompleteIndex = steps.findIndex((step) => !step.done);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide uppercase text-foreground">
            Getting started
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {completedRequired}/{totalRequired} required steps
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={onDismiss}
          aria-label="Dismiss getting started checklist"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ol className="space-y-1">
        {steps.map((step, index) => {
          const isCurrent = index === firstIncompleteIndex;
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  step.done
                    ? "text-muted-foreground hover:bg-muted/60"
                    : "text-foreground hover:bg-muted",
                  isCurrent && "tour-checklist-current bg-primary/5",
                  step.optional && !step.done && "opacity-80"
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {step.done ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Circle
                      className={cn(
                        "h-3.5 w-3.5",
                        isCurrent ? "text-primary" : "text-muted-foreground/50"
                      )}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium leading-snug">
                    {step.title}
                    {step.optional ? (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        optional
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-[11px] text-muted-foreground leading-snug mt-0.5">
                    {step.description}
                  </span>
                  {step.hint && !step.done ? (
                    <span className="block text-[11px] text-amber-700 leading-snug mt-0.5">
                      {step.hint}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-full justify-start px-2 text-xs text-muted-foreground"
        onClick={onReplayTour}
      >
        <HelpCircle className="h-3.5 w-3.5 mr-2" />
        Replay tour
      </Button>
    </div>
  );
}

export default function GettingStarted({
  steps,
  completedRequired,
  totalRequired,
  visible,
  onDismiss,
  onReplayTour,
}: {
  steps: ChecklistStep[];
  completedRequired: number;
  totalRequired: number;
  visible: boolean;
  onDismiss: () => void;
  onReplayTour: () => void;
}) {
  const [open, setOpen] = useState(false);
  const currentStep = steps.find((step) => !step.done);

  if (!visible) {
    return (
      <div className="space-y-1 shrink-0" data-tour="getting-started">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-white hover:bg-white/10"
          onClick={onReplayTour}
        >
          <HelpCircle className="h-4 w-4 mr-2" />
          Replay tour
        </Button>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-white hover:bg-white/10"
        >
          <Link href="/settings/guide" data-tour="setup-guide">
            <BookOpen className="h-4 w-4 mr-2" />
            Setup guide
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1 shrink-0" data-tour="getting-started">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "w-full justify-between text-sidebar-foreground hover:text-white hover:bg-white/10",
          currentStep && "tour-checklist-current"
        )}
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <ListChecks className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Setup ({completedRequired}/{totalRequired})
          </span>
        </span>
        <span className="text-[10px] text-white/45 shrink-0 ml-2">Open</span>
      </Button>

      <Button
        asChild
        variant="ghost"
        size="sm"
        className="w-full justify-start text-sidebar-foreground/70 hover:text-white hover:bg-white/10"
      >
        <Link href="/settings/guide" data-tour="setup-guide">
          <BookOpen className="h-4 w-4 mr-2" />
          Setup guide
        </Link>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Getting started</DialogTitle>
            <DialogDescription>
              Follow these steps from setup to a safe test email, then go live
              when ready.
            </DialogDescription>
          </DialogHeader>
          <ChecklistBody
            steps={steps}
            completedRequired={completedRequired}
            totalRequired={totalRequired}
            onDismiss={() => {
              setOpen(false);
              onDismiss();
            }}
            onReplayTour={() => {
              setOpen(false);
              onReplayTour();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
