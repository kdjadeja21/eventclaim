"use client";

import { useState, useTransition } from "react";
import {
  Download,
  FlaskConical,
  Loader2,
  AlertTriangle,
} from "lucide-react";
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
import {
  abortLoadTest,
  finalizeLoadTest,
  prepareLoadTest,
} from "./load-test-actions";
import type { CapacityTestReport, CapacityWaveReport } from "@/lib/load-test-types";
import {
  LOAD_TEST_DEFAULT_CONCURRENCY,
  LOAD_TEST_MAX_CONCURRENCY,
  LOAD_TEST_MIN_CONCURRENCY,
} from "@/lib/load-test-config";

type Phase =
  | "idle"
  | "preparing"
  | "running_pages"
  | "running_redeems"
  | "finalizing"
  | "done"
  | "error";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function runHttpWave(
  name: string,
  urls: string[],
  onProgress: (done: number, total: number) => void,
  expectOk: (status: number) => boolean
): Promise<CapacityWaveReport> {
  const n = urls.length;
  const latencies: number[] = [];
  const fails: string[] = [];
  const statusCounts: Record<string, number> = {};
  let done = 0;

  const wallStart = performance.now();
  await Promise.all(
    urls.map(async (url) => {
      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          redirect: "manual",
          headers: { Accept: "text/html,application/json" },
          cache: "no-store",
        });
        // Drain body so connections can be reused.
        await res.text();
        statusCounts[String(res.status)] = (statusCounts[String(res.status)] ?? 0) + 1;
        if (!expectOk(res.status)) {
          fails.push(`${name}: unexpected status ${res.status}`);
        }
        latencies.push(performance.now() - t0);
      } catch (err) {
        fails.push(err instanceof Error ? err.message : String(err));
        statusCounts.error = (statusCounts.error ?? 0) + 1;
        latencies.push(performance.now() - t0);
      } finally {
        done += 1;
        onProgress(done, n);
      }
    })
  );

  const wallMs = performance.now() - wallStart;
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    name,
    concurrency: n,
    ok: n - fails.length,
    fail: fails.length,
    durationMs: wallMs,
    rps: n / (wallMs / 1000),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    statusCounts,
    errors: [...new Set(fails)].slice(0, 8),
  };
}

function verdictFor(report: CapacityTestReport): string {
  const page = report.waves.find((w) => w.name.includes("claim page"));
  const anyFail = report.waves.some((w) => w.fail > 0);
  if (anyFail) return "FAILED — some requests errored under this concurrency.";
  if (page && page.p95 <= 1500) return "PASSED — snappy (page p95 ≤ 1.5s).";
  if (page && page.p95 <= 3000) return "PASSED — usable (page p95 ≤ 3s).";
  return "SURVIVED — zero hard errors, but page latency is elevated (degraded UX).";
}

export default function CapacityTestDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [count, setCount] = useState(String(LOAD_TEST_DEFAULT_CONCURRENCY));
  const [phase, setPhase] = useState<Phase>("idle");
  const [progressLabel, setProgressLabel] = useState("");
  const [report, setReport] = useState<CapacityTestReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const busy = phase !== "idle" && phase !== "done" && phase !== "error";

  function reset() {
    setPhase("idle");
    setProgressLabel("");
    setReport(null);
    setError(null);
    setCount(String(LOAD_TEST_DEFAULT_CONCURRENCY));
  }

  function handleOpenChange(next: boolean) {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `capacity-test-${report.concurrency}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(count);
    if (!Number.isFinite(n) || n < LOAD_TEST_MIN_CONCURRENCY || n > LOAD_TEST_MAX_CONCURRENCY) {
      toast.error(
        `Enter a number between ${LOAD_TEST_MIN_CONCURRENCY} and ${LOAD_TEST_MAX_CONCURRENCY}.`
      );
      return;
    }
    if (n >= 500) {
      const ok = window.confirm(
        `Run a live capacity test with ${n} concurrent requests against this deployment?\n\nThis creates temporary DB rows, hammers /claim URLs, then deletes the test event. Do not run during a real attendee event.`
      );
      if (!ok) return;
    }

    startTransition(async () => {
      setError(null);
      setReport(null);
      let eventId: string | null = null;
      const startedAt = new Date().toISOString();
      const origin = window.location.origin;

      try {
        setPhase("preparing");
        setProgressLabel(`Seeding ${n} temporary attendees…`);
        const prepared = await prepareLoadTest(n);
        if (!prepared.success) {
          throw new Error(prepared.error);
        }
        eventId = prepared.data.eventId;
        const { tokens, redeemCouponId, concurrency } = prepared.data;

        const pageUrls = tokens.map((t) => `${origin}/claim/${encodeURIComponent(t)}`);
        const redeemUrls = tokens.map(
          (t) =>
            `${origin}/claim/${encodeURIComponent(t)}/redeem/${encodeURIComponent(redeemCouponId)}`
        );

        setPhase("running_pages");
        setProgressLabel(`Claim page wave 0 / ${concurrency}`);
        const pageWave = await runHttpWave(
          `GET claim page x${concurrency}`,
          pageUrls,
          (done, total) => setProgressLabel(`Claim page wave ${done} / ${total}`),
          (status) => status === 200
        );

        setPhase("running_redeems");
        setProgressLabel(`Redeem wave 0 / ${concurrency}`);
        const redeemWave = await runHttpWave(
          `GET redeem x${concurrency}`,
          redeemUrls,
          (done, total) => setProgressLabel(`Redeem wave ${done} / ${total}`),
          (status) => status === 302 || status === 307 || status === 200
        );

        const finishedAt = new Date().toISOString();
        const fullReport: CapacityTestReport = {
          concurrency,
          origin,
          startedAt,
          finishedAt,
          waves: [pageWave, redeemWave],
          userAgent: navigator.userAgent,
        };

        setPhase("finalizing");
        setProgressLabel("Saving report and deleting temporary data…");
        const finalized = await finalizeLoadTest(eventId, fullReport);
        eventId = null;
        if (!finalized.success) {
          throw new Error(finalized.error);
        }

        setReport(fullReport);
        setPhase("done");
        setProgressLabel("");
        toast.success("Capacity test complete — temporary data deleted.");
      } catch (err) {
        if (eventId) {
          try {
            await abortLoadTest(eventId);
          } catch {
            /* ignore */
          }
        }
        const msg = err instanceof Error ? err.message : "Capacity test failed.";
        setError(msg);
        setPhase("error");
        setProgressLabel("");
        toast.error(msg);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Capacity test
          </DialogTitle>
          <DialogDescription>
            Seeds temporary attendees, hits this live URL&apos;s claim pages and
            redeem routes concurrently, then deletes the test event. Only an
            audit-log report remains.
          </DialogDescription>
        </DialogHeader>

        {(phase === "idle" || phase === "error") && (
          <form onSubmit={handleStart} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="capacity-count">Concurrent users</Label>
              <Input
                id="capacity-count"
                type="number"
                min={LOAD_TEST_MIN_CONCURRENCY}
                max={LOAD_TEST_MAX_CONCURRENCY}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                Allowed range: {LOAD_TEST_MIN_CONCURRENCY}–{LOAD_TEST_MAX_CONCURRENCY}.
                Confirm is required at 500+.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Do not run during a real attendee event. This stresses the live
                deployment from your browser.
              </span>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                "Run capacity test"
              )}
            </Button>
          </form>
        )}

        {busy && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p>{progressLabel || "Working…"}</p>
          </div>
        )}

        {phase === "done" && report && (
          <div className="space-y-4">
            <p className="text-sm font-medium">{verdictFor(report)}</p>
            <div className="space-y-3">
              {report.waves.map((w) => (
                <div
                  key={w.name}
                  className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1"
                >
                  <p className="font-medium text-sm">{w.name}</p>
                  <p>
                    ok={w.ok} fail={w.fail} wall={w.durationMs.toFixed(0)}ms rps=
                    {w.rps.toFixed(1)}
                  </p>
                  <p>
                    p50={w.p50.toFixed(0)}ms p95={w.p95.toFixed(0)}ms p99=
                    {w.p99.toFixed(0)}ms max={w.max.toFixed(0)}ms
                  </p>
                  <p className="text-muted-foreground">
                    statuses={JSON.stringify(w.statusCounts)}
                  </p>
                  {w.errors.length > 0 && (
                    <p className="text-destructive">{w.errors.join(" · ")}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadReport}>
                <Download className="h-4 w-4" />
                Download JSON
              </Button>
              <Button
                type="button"
                onClick={() => {
                  reset();
                }}
              >
                Run again
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
