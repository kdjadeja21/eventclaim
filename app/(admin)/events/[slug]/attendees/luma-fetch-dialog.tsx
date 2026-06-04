"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RefreshCw, Clock } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { LumaApprovalStatus, LumaSortColumn, LumaSortDirection } from "@/lib/luma";

export interface LumaFetchConfig {
  lumaEventId: string;
  approvalStatus: LumaApprovalStatus | "any";
  sortColumn: LumaSortColumn | "none";
  sortDirection: LumaSortDirection | "none";
  intervalMinutes: number;
  autoFetch: boolean;
  checkedInOnly: boolean;
}

interface RunStatus {
  addedCount: number;
  skipped: number;
  totalFetched: number;
  checkedInCount: number;
  noCheckedInRecords: boolean;
  checkedInOnly: boolean;
}

interface LumaFetchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventSlug: string;
  lastSyncedAt: string | null;
  isFetching: boolean;
  lastRunStatus: RunStatus | null;
  config: LumaFetchConfig;
  onConfigChange: (config: LumaFetchConfig) => void;
  onFetchNow: () => void;
}

const STORAGE_KEY_PREFIX = "luma-fetch-config-";

export function getStoredConfig(eventSlug: string): LumaFetchConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + eventSlug);
    return raw ? (JSON.parse(raw) as LumaFetchConfig) : null;
  } catch {
    return null;
  }
}

export function saveStoredConfig(eventSlug: string, config: LumaFetchConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + eventSlug, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}

export const defaultConfig: LumaFetchConfig = {
  lumaEventId: "",
  approvalStatus: "approved",
  sortColumn: "registered_at",
  sortDirection: "desc",
  intervalMinutes: 5,
  autoFetch: false,
  checkedInOnly: true,
};

export default function LumaFetchDialog({
  open,
  onOpenChange,
  lastSyncedAt,
  isFetching,
  lastRunStatus,
  config,
  onConfigChange,
  onFetchNow,
}: LumaFetchDialogProps) {
  const [draft, setDraft] = useState<LumaFetchConfig>(config);

  // Sync draft when external config changes (e.g. loaded from localStorage)
  useEffect(() => {
    setDraft(config);
  }, [config]);

  function set<K extends keyof LumaFetchConfig>(key: K, value: LumaFetchConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    onConfigChange(draft);
    onOpenChange(false);
  }

  const canFetch = draft.lumaEventId.trim().length > 0;
  const intervalLabel = draft.intervalMinutes <= 0
    ? "Off (manual only)"
    : `Every ${draft.intervalMinutes} min`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Fetch from Luma
          </DialogTitle>
          <DialogDescription>
            Pull guests from the Luma API and add new ones as attendees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Luma Event ID */}
          <div className="space-y-1.5">
            <Label htmlFor="luma-event-id">Luma Event ID</Label>
            <Input
              id="luma-event-id"
              placeholder="evt-xxxxxxxxxxxxxxxx"
              value={draft.lumaEventId}
              onChange={(e) => set("lumaEventId", e.target.value.trim())}
            />
            <p className="text-xs text-muted-foreground">
              Starts with <code>evt-</code>. Find it in your Luma event URL or dashboard.
            </p>
          </div>

          {/* Approval Status */}
          <div className="space-y-1.5">
            <Label>Approval Status</Label>
            <Select
              value={draft.approvalStatus}
              onValueChange={(v) => set("approvalStatus", v as LumaFetchConfig["approvalStatus"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="session">Session</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="invited">Invited</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
                <SelectItem value="waitlist">Waitlist</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Sort Column */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Sort By</Label>
              <Select
                value={draft.sortColumn}
                onValueChange={(v) => set("sortColumn", v as LumaFetchConfig["sortColumn"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="created_at">Created At</SelectItem>
                  <SelectItem value="registered_at">Registered At</SelectItem>
                  <SelectItem value="checked_in_at">Checked In At</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Direction */}
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select
                value={draft.sortDirection}
                onValueChange={(v) => set("sortDirection", v as LumaFetchConfig["sortDirection"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default</SelectItem>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                  <SelectItem value="asc nulls last">Asc (nulls last)</SelectItem>
                  <SelectItem value="desc nulls last">Desc (nulls last)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Auto-fetch interval */}
          <div className="space-y-1.5">
            <Label>Auto-fetch Interval</Label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  min={0}
                  className="pl-8"
                  value={draft.intervalMinutes}
                  onChange={(e) => set("intervalMinutes", Math.max(0, Number(e.target.value)))}
                />
              </div>
              <span className="text-sm text-muted-foreground shrink-0">minutes</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {intervalLabel}. Set to 0 to disable auto-fetch.
            </p>
          </div>

          {/* Checked-in only toggle */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Checked-in guests only</p>
              <p className="text-xs text-muted-foreground">Skip guests where check-in time is missing</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.checkedInOnly}
              onClick={() => set("checkedInOnly", !draft.checkedInOnly)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                draft.checkedInOnly ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  draft.checkedInOnly ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Auto-fetch toggle */}
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Auto-fetch</p>
              <p className="text-xs text-muted-foreground">Automatically fetch on the interval above</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.autoFetch}
              disabled={draft.intervalMinutes <= 0}
              onClick={() => set("autoFetch", !draft.autoFetch)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                draft.autoFetch ? "bg-primary" : "bg-input"
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  draft.autoFetch ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Last updated + last run status */}
          <div className="rounded-md bg-muted/40 px-3 py-2.5 text-xs space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <span>Last updated</span>
              <span className="font-medium text-foreground">
                {lastSyncedAt ? formatDateTime(lastSyncedAt) : "Never"}
              </span>
            </div>
            {lastRunStatus && (
              <>
                <div className="flex justify-between">
                  <span>Last run</span>
                  <span className="font-medium text-foreground">
                    {lastRunStatus.addedCount} added · {lastRunStatus.skipped} skipped ·{" "}
                    {lastRunStatus.totalFetched} fetched
                    {lastRunStatus.checkedInOnly &&
                      ` · ${lastRunStatus.checkedInCount} checked in`}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={!canFetch || isFetching}
              onClick={() => {
                onConfigChange(draft);
                onFetchNow();
              }}
            >
              {isFetching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {isFetching ? "Fetching…" : "Fetch Now"}
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={!canFetch}
              onClick={handleSave}
            >
              Save & Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
