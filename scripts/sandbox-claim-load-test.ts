/**
 * Concurrent claim-path load test against a throwaway Postgres sandbox.
 *
 * Exercises the same functions the live portal uses when attendees open a
 * claim page and redeem offers:
 *   - getClaimPageData(token)          — SSR page load
 *   - markGrantClaimedByToken(...)     — copy / redeem write path
 *
 * This measures data-layer capacity under the app's real pool settings
 * (postgres.js max: 10). It does NOT simulate Vercel multi-isolate fan-out
 * or full Next.js SSR/render cost — those need an HTTP load tool against a
 * deployed URL.
 *
 * Run:
 *   DATABASE_URL=... DIRECT_URL=... \
 *     NODE_OPTIONS='--conditions=react-server' \
 *     npx tsx scripts/sandbox-claim-load-test.ts
 *
 * Optional env:
 *   LOAD_ATTENDEES=500          how many attendees/grants to seed
 *   LOAD_CONCURRENCIES=300,500  comma-separated concurrent waves
 *   LOAD_COUPONS=4              offers per attendee (1 uniqueLink + rest shared)
 */

import { performance } from "node:perf_hooks";

type Latencies = number[];

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
};

const ATTENDEE_COUNT = Number(process.env.LOAD_ATTENDEES ?? 500);
const CONCURRENCIES = (process.env.LOAD_CONCURRENCIES ?? "300,500")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);
const COUPON_COUNT = Math.max(2, Number(process.env.LOAD_COUPONS ?? 4));

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function summarize(name: string, concurrency: number, latencies: Latencies, fails: string[]): WaveResult {
  const sorted = [...latencies].sort((a, b) => a - b);
  const durationMs = sorted.length ? Math.max(...sorted) : 0;
  // Wall-clock for the wave is tracked separately by the caller; here durationMs
  // is max individual latency. rps is filled in by runWave.
  return {
    name,
    concurrency,
    ok: latencies.length,
    fail: fails.length,
    durationMs,
    rps: 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    errors: [...new Set(fails)].slice(0, 5),
  };
}

async function runWave<T>(
  name: string,
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<WaveResult> {
  const n = Math.min(concurrency, items.length);
  const slice = items.slice(0, n);
  const latencies: Latencies = [];
  const fails: string[] = [];

  const wallStart = performance.now();
  await Promise.all(
    slice.map(async (item, index) => {
      const t0 = performance.now();
      try {
        await fn(item, index);
        latencies.push(performance.now() - t0);
      } catch (err) {
        fails.push(err instanceof Error ? err.message : String(err));
        latencies.push(performance.now() - t0);
      }
    })
  );
  const wallMs = performance.now() - wallStart;
  const result = summarize(name, n, latencies, fails);
  result.durationMs = wallMs;
  result.rps = n / (wallMs / 1000);
  // Recompute ok excluding failures tracked separately — every attempt pushed a latency.
  result.ok = n - fails.length;
  result.fail = fails.length;
  return result;
}

function printResult(r: WaveResult) {
  const status = r.fail === 0 ? "PASS" : "FAIL";
  console.log(
    `  [${status}] ${r.name}  n=${r.concurrency}  wall=${r.durationMs.toFixed(0)}ms  ` +
      `rps=${r.rps.toFixed(1)}  p50=${r.p50.toFixed(0)}ms  p95=${r.p95.toFixed(0)}ms  ` +
      `p99=${r.p99.toFixed(0)}ms  max=${r.max.toFixed(0)}ms  ok=${r.ok} fail=${r.fail}`
  );
  if (r.errors.length) {
    for (const e of r.errors) console.log(`         error: ${e}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (throwaway sandbox Postgres).");
  }

  const { insertEvent, deleteEventCascade } = await import("@/lib/db/repos/events");
  const { bulkInsertAttendees, listAttendeesForEvent } = await import("@/lib/db/repos/attendees");
  const { insertCoupon } = await import("@/lib/db/repos/coupons");
  const { bulkInsertCouponLinks } = await import("@/lib/db/repos/links");
  const { assignPendingForEvent } = await import("@/lib/db/repos/grants");
  const { getClaimPageData, markGrantClaimedByToken } = await import("@/lib/claim-tracking");

  const eventId = `evt_load_${Date.now()}`;
  const now = new Date().toISOString();
  const results: WaveResult[] = [];

  console.log("=== Sandbox claim load test ===");
  console.log(`attendees=${ATTENDEE_COUNT} coupons=${COUPON_COUNT} waves=${CONCURRENCIES.join(",")}`);
  console.log(`pool: postgres.js max=10 (same as lib/db/client.ts)\n`);

  console.log("=== Seed ===");
  await insertEvent({
    id: eventId,
    name: "Load Test Event",
    slug: `load-test-${Date.now()}`,
    date: now.slice(0, 10),
    notionGuideUrl: "",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const attendeeRows = Array.from({ length: ATTENDEE_COUNT }, (_, i) => ({
    id: `load_att_${i}`,
    eventId,
    name: `Load Attendee ${i}`,
    email: `load${i}@example.com`,
    createdAt: now,
  }));
  const imported = await bulkInsertAttendees(attendeeRows);
  console.log(`  inserted ${imported.insertedCount} attendees`);

  // 1 uniqueLink (enough pool for everyone) + shared coupons — mirrors a typical event.
  const uniqueCouponId = "load_cpn_unique";
  await insertCoupon({
    id: uniqueCouponId,
    eventId,
    name: "Unique Partner Credits",
    kind: "uniqueLink",
    category: "CREDITS",
    logoUrl: "",
    highlight: "Free credits",
    description: "Redeem via unique link",
    sortOrder: 0,
    isDisabled: false,
    createdAt: now,
    linkTotal: 0,
    linkAvailable: 0,
  });
  const linkRows = Array.from({ length: ATTENDEE_COUNT }, (_, i) => ({
    id: `load_lnk_${i}`,
    couponId: uniqueCouponId,
    eventId,
    url: `https://partner.example/redeem/${i}`,
  }));
  await bulkInsertCouponLinks(linkRows);
  console.log(`  uniqueLink coupon + ${linkRows.length} pool links`);

  for (let c = 1; c < COUPON_COUNT; c++) {
    await insertCoupon({
      id: `load_cpn_shared_${c}`,
      eventId,
      name: `Shared Offer ${c}`,
      kind: c % 2 === 0 ? "sharedLink" : "sharedCode",
      category: "PARTNER",
      logoUrl: "",
      highlight: `Offer ${c}`,
      description: `Sandbox shared offer ${c}`,
      sharedValue:
        c % 2 === 0 ? `https://partner.example/shared/${c}` : `CODE${c}`,
      redeemUrl: c % 2 === 0 ? `https://partner.example/shared/${c}` : undefined,
      sortOrder: c,
      isDisabled: false,
      createdAt: now,
    });
  }
  console.log(`  ${COUPON_COUNT - 1} shared coupons`);

  const assignStart = performance.now();
  const touched = await assignPendingForEvent(eventId);
  console.log(
    `  assignPendingForEvent touched ${touched.length} attendees in ${(performance.now() - assignStart).toFixed(0)}ms`
  );

  const attendees = await listAttendeesForEvent(eventId);
  const withTokens = attendees.filter((a) => a.claimToken);
  if (withTokens.length < Math.max(...CONCURRENCIES, 1)) {
    throw new Error(
      `Need at least ${Math.max(...CONCURRENCIES)} claim tokens, got ${withTokens.length}`
    );
  }
  console.log(`  claim tokens ready: ${withTokens.length}\n`);

  // Warm a single page load so cold-start JIT/connection isn't in the first wave.
  await getClaimPageData(withTokens[0].claimToken!);

  for (const concurrency of CONCURRENCIES) {
    console.log(`=== Wave: ${concurrency} concurrent claim page loads ===`);
    const pageWave = await runWave(
      `GET claim page x${concurrency}`,
      withTokens,
      concurrency,
      async (attendee) => {
        const data = await getClaimPageData(attendee.claimToken!);
        if (!data.found) throw new Error("claim page not found");
        if (data.grants.length === 0) throw new Error("no grants on claim page");
      }
    );
    printResult(pageWave);
    results.push(pageWave);

    console.log(`=== Wave: ${concurrency} concurrent claims (1 offer each) ===`);
    // Use a fresh unused shared coupon index per wave by cycling attendees that
    // still have an assigned (unclaimed) shared grant. First wave claims shared_1,
    // second wave claims shared_2 when available, else uniqueLink.
    const couponIdForWave =
      concurrency === CONCURRENCIES[0]
        ? "load_cpn_shared_1"
        : COUPON_COUNT > 2
          ? "load_cpn_shared_2"
          : uniqueCouponId;

    const claimWave = await runWave(
      `CLAIM ${couponIdForWave} x${concurrency}`,
      withTokens,
      concurrency,
      async (attendee) => {
        const result = await markGrantClaimedByToken(
          attendee.claimToken!,
          couponIdForWave,
          "redeem_redirect"
        );
        if (!result.success) throw new Error(result.error ?? "claim failed");
        if (!result.found) throw new Error("grant not found");
      }
    );
    printResult(claimWave);
    results.push(claimWave);

    console.log(`=== Wave: ${concurrency} concurrent page+claim (burst) ===`);
    // Remaining coupons: claim uniqueLink for attendees who haven't claimed it.
    const burstCouponId = uniqueCouponId;
    const burstWave = await runWave(
      `PAGE+CLAIM burst x${concurrency}`,
      withTokens,
      concurrency,
      async (attendee) => {
        const data = await getClaimPageData(attendee.claimToken!);
        if (!data.found) throw new Error("claim page not found");
        const result = await markGrantClaimedByToken(
          attendee.claimToken!,
          burstCouponId,
          "copy"
        );
        if (!result.success) throw new Error(result.error ?? "claim failed");
      }
    );
    printResult(burstWave);
    results.push(burstWave);
    console.log("");
  }

  console.log("=== Cleanup ===");
  await deleteEventCascade(eventId);
  console.log("  event cascade-deleted\n");

  console.log("=== Summary ===");
  const anyFail = results.some((r) => r.fail > 0);
  const slowPage = results.filter((r) => r.name.includes("claim page") && r.p95 > 2000);
  const slowClaim = results.filter((r) => r.name.startsWith("CLAIM") && r.p95 > 2000);

  for (const r of results) printResult(r);

  console.log("\nInterpretation:");
  console.log(
    "  - This sandbox uses one Node process + postgres.js max=10, matching the app pool."
  );
  console.log(
    "  - Failures or multi-second p95 under concurrency usually mean pool queueing,"
  );
  console.log(
    "    not Postgres being unable to store 300–500 claims."
  );
  if (anyFail) {
    console.log("  VERDICT: FAILED — errors under concurrent load (see above).");
    process.exitCode = 1;
  } else if (slowPage.length || slowClaim.length) {
    console.log(
      "  VERDICT: SURVIVED but SLOW — zero errors, but p95 > 2s on some waves."
    );
    console.log(
      "  Live door-rush UX may feel stuck; worth optimizing claim-page reads / pool sizing."
    );
  } else {
    console.log(
      "  VERDICT: PASSED — zero errors and p95 ≤ 2s for tested waves in this sandbox."
    );
  }
}

main()
  .then(async () => {
    const { db } = await import("@/lib/db/client");
    await db.$client.end({ timeout: 5 });
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (err) => {
    console.error("LOAD TEST FAILED:", err);
    try {
      const { db } = await import("@/lib/db/client");
      await db.$client.end({ timeout: 5 });
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
