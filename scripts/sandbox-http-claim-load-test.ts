/**
 * HTTP claim-path load test against a running Next.js server (`next start`).
 *
 * Seeds attendees into DATABASE_URL, writes claim tokens, then fires concurrent
 * GET /claim/[token] and GET /claim/[token]/redeem/[couponId] requests.
 *
 * Prerequisites:
 *   - Migrations applied
 *   - `next start` listening on BASE_URL (default http://127.0.0.1:3000)
 *   - DATABASE_URL / DIRECT_URL set
 *
 * Run:
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/sandbox-http-claim-load-test.ts
 *
 * Env:
 *   BASE_URL=http://127.0.0.1:3000
 *   LOAD_ATTENDEES=1000
 *   LOAD_CONCURRENCIES=100,300,500,800,1000
 */

import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";

type WaveResult = {
  name: string;
  concurrency: number;
  ok: number;
  fail: number;
  durationMs: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errors: string[];
  statusCounts: Record<string, number>;
};

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const ATTENDEE_COUNT = Number(process.env.LOAD_ATTENDEES ?? 1000);
const CONCURRENCIES = (process.env.LOAD_CONCURRENCIES ?? "100,300,500,800,1000")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function runWave(
  name: string,
  urls: string[],
  concurrency: number,
  expect: (status: number, body: string) => void
): Promise<WaveResult> {
  const n = Math.min(concurrency, urls.length);
  const slice = urls.slice(0, n);
  const latencies: number[] = [];
  const fails: string[] = [];
  const statusCounts: Record<string, number> = {};

  const wallStart = performance.now();
  await Promise.all(
    slice.map(async (url) => {
      const t0 = performance.now();
      try {
        const res = await fetch(url, {
          redirect: "manual",
          headers: { Accept: "text/html,application/json" },
        });
        const body = await res.text();
        statusCounts[String(res.status)] = (statusCounts[String(res.status)] ?? 0) + 1;
        expect(res.status, body);
        latencies.push(performance.now() - t0);
      } catch (err) {
        fails.push(err instanceof Error ? err.message : String(err));
        statusCounts.error = (statusCounts.error ?? 0) + 1;
        latencies.push(performance.now() - t0);
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
    errors: [...new Set(fails)].slice(0, 5),
    statusCounts,
  };
}

function printResult(r: WaveResult) {
  const status = r.fail === 0 ? "PASS" : "FAIL";
  console.log(
    `  [${status}] ${r.name}  n=${r.concurrency}  wall=${r.durationMs.toFixed(0)}ms  ` +
      `rps=${r.rps.toFixed(1)}  p50=${r.p50.toFixed(0)}ms  p95=${r.p95.toFixed(0)}ms  ` +
      `p99=${r.p99.toFixed(0)}ms  max=${r.max.toFixed(0)}ms  ok=${r.ok} fail=${r.fail}  ` +
      `statuses=${JSON.stringify(r.statusCounts)}`
  );
  for (const e of r.errors) console.log(`         error: ${e}`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  // Health check
  const health = await fetch(BASE_URL, { redirect: "manual" });
  void health;
  console.log(`=== HTTP claim load test against ${BASE_URL} ===\n`);

  const { insertEvent, deleteEventCascade } = await import("@/lib/db/repos/events");
  const { bulkInsertAttendees, listAttendeesForEvent } = await import("@/lib/db/repos/attendees");
  const { insertCoupon } = await import("@/lib/db/repos/coupons");
  const { bulkInsertCouponLinks } = await import("@/lib/db/repos/links");
  const { assignPendingForEvent } = await import("@/lib/db/repos/grants");

  const eventId = `evt_http_load_${Date.now()}`;
  const now = new Date().toISOString();
  const results: WaveResult[] = [];

  console.log("=== Seed ===");
  await insertEvent({
    id: eventId,
    name: "HTTP Load Test Event",
    slug: `http-load-${Date.now()}`,
    date: now.slice(0, 10),
    notionGuideUrl: "",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  await bulkInsertAttendees(
    Array.from({ length: ATTENDEE_COUNT }, (_, i) => ({
      id: `http_att_${i}`,
      eventId,
      name: `HTTP Attendee ${i}`,
      email: `http${i}@example.com`,
      createdAt: now,
    }))
  );

  const uniqueCouponId = "http_cpn_unique";
  const sharedCouponId = "http_cpn_shared";
  await insertCoupon({
    id: uniqueCouponId,
    eventId,
    name: "Unique Credits",
    kind: "uniqueLink",
    category: "CREDITS",
    logoUrl: "",
    highlight: "Free",
    description: "Unique link offer",
    sortOrder: 0,
    isDisabled: false,
    createdAt: now,
    linkTotal: 0,
    linkAvailable: 0,
  });
  await bulkInsertCouponLinks(
    Array.from({ length: ATTENDEE_COUNT }, (_, i) => ({
      id: `http_lnk_${i}`,
      couponId: uniqueCouponId,
      eventId,
      url: `https://partner.example/redeem/${i}`,
    }))
  );
  await insertCoupon({
    id: sharedCouponId,
    eventId,
    name: "Shared Code",
    kind: "sharedCode",
    category: "CODE",
    logoUrl: "",
    highlight: "SAVE",
    description: "Shared code offer",
    sharedValue: "LOADTEST",
    sortOrder: 1,
    isDisabled: false,
    createdAt: now,
  });
  // Extra sharedLink so redeem path has a URL redirect target for burst claims.
  const sharedLinkId = "http_cpn_shared_link";
  await insertCoupon({
    id: sharedLinkId,
    eventId,
    name: "Shared Link",
    kind: "sharedLink",
    category: "LINK",
    logoUrl: "",
    highlight: "Open",
    description: "Shared link offer",
    sharedValue: "https://partner.example/shared",
    redeemUrl: "https://partner.example/shared",
    sortOrder: 2,
    isDisabled: false,
    createdAt: now,
  });

  await assignPendingForEvent(eventId);
  const attendees = (await listAttendeesForEvent(eventId)).filter((a) => a.claimToken);
  console.log(`  ${attendees.length} claim tokens ready\n`);

  const pageUrls = attendees.map((a) => `${BASE_URL}/claim/${a.claimToken}`);
  const redeemUrls = attendees.map(
    (a) => `${BASE_URL}/claim/${a.claimToken}/redeem/${uniqueCouponId}`
  );

  writeFileSync(
    "/tmp/claim-tokens.json",
    JSON.stringify(
      attendees.map((a) => ({ token: a.claimToken, id: a.id })),
      null,
      2
    )
  );

  // Warmup
  await fetch(pageUrls[0], { redirect: "manual" });

  for (const concurrency of CONCURRENCIES) {
    console.log(`=== HTTP wave n=${concurrency} ===`);
    const pageWave = await runWave(
      `GET /claim/[token] x${concurrency}`,
      pageUrls,
      concurrency,
      (status, body) => {
        if (status !== 200) throw new Error(`page status ${status}`);
        if (!body.includes("Partner offers") && !body.includes("partner")) {
          // Still accept 200 HTML even if copy differs
          if (!body.includes("html")) throw new Error("page body missing html");
        }
      }
    );
    printResult(pageWave);
    results.push(pageWave);

    const redeemWave = await runWave(
      `GET /redeem uniqueLink x${concurrency}`,
      redeemUrls,
      concurrency,
      (status) => {
        // First claim -> 302 to partner; repeat -> 302 back to claim page or partner
        if (status !== 302 && status !== 307 && status !== 200) {
          throw new Error(`redeem status ${status}`);
        }
      }
    );
    printResult(redeemWave);
    results.push(redeemWave);
    console.log("");
  }

  console.log("=== Cleanup ===");
  await deleteEventCascade(eventId);

  console.log("\n=== Summary ===");
  for (const r of results) printResult(r);

  const failed = results.filter((r) => r.fail > 0);
  const slow = results.filter((r) => r.p95 > 3000);
  const comfortable = results.filter((r) => r.fail === 0 && r.p95 <= 1500);
  const maxComfortable = comfortable.length
    ? Math.max(...comfortable.map((r) => r.concurrency))
    : 0;
  const maxSurvived = results.filter((r) => r.fail === 0).length
    ? Math.max(...results.filter((r) => r.fail === 0).map((r) => r.concurrency))
    : 0;

  console.log("\nCapacity read:");
  console.log(`  Max concurrency with p95 ≤ 1.5s and 0 errors: ${maxComfortable || "none"}`);
  console.log(`  Max concurrency survived with 0 errors: ${maxSurvived || "none"}`);
  if (failed.length) {
    console.log(`  First failure wave: ${failed[0].name}`);
    process.exitCode = 1;
  } else if (slow.length) {
    console.log("  Survived all waves but some p95 > 3s (degraded UX).");
  } else {
    console.log("  All waves healthy.");
  }
}

main()
  .then(async () => {
    const { db } = await import("@/lib/db/client");
    await db.$client.end({ timeout: 5 });
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (err) => {
    console.error("HTTP LOAD TEST FAILED:", err);
    try {
      const { db } = await import("@/lib/db/client");
      await db.$client.end({ timeout: 5 });
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
