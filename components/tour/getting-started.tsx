"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Check,
  ChevronUp,
  Circle,
  HelpCircle,
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
  compact = false,
}: {
  steps: ChecklistStep[];
  completedRequired: number;
  totalRequired: number;
  onDismiss: () => void;
  onReplayTour: () => void;
  compact?: boolean;
}) {
  const firstIncompleteIndex = steps.findIndex((step) => !step.done);

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-white tracking-wide uppercase">
            Getting started
          </p>
          <p className="text-[11px] text-white/55 mt-0.5">
            {completedRequired}/{totalRequired} required steps
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-white/50 hover:text-white hover:bg-white/10"
          onClick={onDismiss}
          aria-label="Dismiss getting started checklist"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ol className="space-y-1.5">
        {steps.map((step, index) => {
          const isCurrent = index === firstIncompleteIndex;
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  "flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  step.done
                    ? "text-white/45 hover:bg-white/5"
                    : "text-white/85 hover:bg-white/10",
                  isCurrent && "tour-checklist-current bg-white/5",
                  step.optional && !step.done && "opacity-80"
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {step.done ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Circle
                      className={cn(
                        "h-3.5 w-3.5",
                        isCurrent ? "text-primary" : "text-white/35"
                      )}
                    />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium leading-snug">
                    {step.title}
                    {step.optional ? (
                      <span className="ml-1 text-[10px] font-normal text-white/40">
                        optional
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-[11px] text-white/45 leading-snug mt-0.5">
                    {step.description}
                  </span>
                  {step.hint && !step.done ? (
                    <span className="block text-[11px] text-amber-200/80 leading-snug mt-0.5">
                      {step.hint}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-1.5 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 justify-start px-2 text-xs text-white/70 hover:text-white hover:bg-white/10"
          onClick={onReplayTour}
        >
          <HelpCircle className="h-3.5 w-3.5 mr-2" />
          Replay tour
        </Button>
      </div>
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
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!visible) {
    return (
      <div className="space-y-1" data-tour="getting-started">
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
    <div className="space-y-2" data-tour="getting-started">
      {/* Desktop / wide sidebar panel */}
      <div className="hidden sm:block rounded-lg border border-white/10 bg-white/5 p-3">
        <div>
          <ChecklistBody
            steps={steps}
            completedRequired={completedRequired}
            totalRequired={totalRequired}
            onDismiss={onDismiss}
            onReplayTour={onReplayTour}
          />
        </div>
      </div>

      {/* Narrow / mobile compact control */}
      <div className="sm:hidden">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-between text-sidebar-foreground hover:text-white hover:bg-white/10"
          onClick={() => setMobileOpen(true)}
        >
          <span className="inline-flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            Setup ({completedRequired}/{totalRequired})
          </span>
          <ChevronUp className="h-3.5 w-3.5 opacity-50 rotate-180" />
        </Button>
        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogContent className="sm:max-w-md bg-sidebar text-sidebar-foreground border-sidebar-border">
            <DialogHeader>
              <DialogTitle className="text-white">Getting started</DialogTitle>
              <DialogDescription className="text-white/55">
                Follow these steps from setup to a safe test email.
              </DialogDescription>
            </DialogHeader>
            <ChecklistBody
              steps={steps}
              completedRequired={completedRequired}
              totalRequired={totalRequired}
              onDismiss={() => {
                setMobileOpen(false);
                onDismiss();
              }}
              onReplayTour={() => {
                setMobileOpen(false);
                onReplayTour();
              }}
              compact
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Always in-flow so the orientation tour can highlight it on any breakpoint */}
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
