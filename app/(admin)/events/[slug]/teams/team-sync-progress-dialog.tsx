"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2 } from "lucide-react";

export type SyncPhase =
  | "preparing"
  | "fetching"
  | "saving"
  | "building"
  | "done"
  | "error";

export interface SyncProgressState {
  open: boolean;
  phase: SyncPhase;
  processed: number;
  fetched: number;
  message: string;
  error?: string;
}

const phaseLabels: Record<SyncPhase, string> = {
  preparing: "Preparing sync…",
  fetching: "Fetching from Luma…",
  saving: "Saving registrations…",
  building: "Building teams…",
  done: "Sync complete",
  error: "Sync failed",
};

interface TeamSyncProgressDialogProps {
  state: SyncProgressState;
}

export function TeamSyncProgressDialog({ state }: TeamSyncProgressDialogProps) {
  const { open, phase, processed, fetched, message, error } = state;

  const progressPercent =
    phase === "done"
      ? 100
      : phase === "building"
        ? 92
        : phase === "preparing"
          ? 5
          : fetched > 0
            ? Math.min(90, Math.round((processed / fetched) * 85) + 5)
            : phase === "fetching"
              ? 15
              : 10;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {phase === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : phase === "error" ? null : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
            {phaseLabels[phase]}
          </DialogTitle>
          <DialogDescription>
            {error ?? message ?? "Please wait while registrations are synced."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {fetched > 0
                ? `${processed} of ${fetched} saved`
                : phase === "fetching"
                  ? "Contacting Luma API…"
                  : "Starting…"}
            </span>
            <span>{progressPercent}%</span>
          </div>
          {fetched >= 100 && phase === "saving" && (
            <p className="text-xs text-muted-foreground">
              Large syncs are processed in batches to keep the app responsive.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const initialSyncProgress: SyncProgressState = {
  open: false,
  phase: "preparing",
  processed: 0,
  fetched: 0,
  message: "",
};
