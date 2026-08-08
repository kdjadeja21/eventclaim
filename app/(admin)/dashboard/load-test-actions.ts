"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  assertLoadTestEnabled,
  clampLoadTestConcurrency,
  LOAD_TEST_MAX_CONCURRENCY,
  LOAD_TEST_MIN_CONCURRENCY,
} from "@/lib/load-test-config";
import {
  cleanupLoadTestEvent,
  prepareLoadTestEvent,
  type CapacityTestReport,
  type PrepareLoadTestResult,
} from "@/lib/load-test";
import { requireSession } from "@/lib/session";

export async function prepareLoadTest(
  count: number
): Promise<{ success: true; data: PrepareLoadTestResult } | { success: false; error: string }> {
  try {
    assertLoadTestEnabled();
    await requireSession();
    const concurrency = clampLoadTestConcurrency(count);
    if (concurrency < LOAD_TEST_MIN_CONCURRENCY || concurrency > LOAD_TEST_MAX_CONCURRENCY) {
      return {
        success: false,
        error: `Concurrency must be between ${LOAD_TEST_MIN_CONCURRENCY} and ${LOAD_TEST_MAX_CONCURRENCY}.`,
      };
    }
    const data = await prepareLoadTestEvent(concurrency);
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to prepare load test.",
    };
  }
}

export async function finalizeLoadTest(
  eventId: string,
  report: CapacityTestReport
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    assertLoadTestEnabled();
    const session = await requireSession();

    await writeAuditLog({
      eventId,
      action: "capacity_test_completed",
      userId: session.uid,
      metadata: {
        concurrency: report.concurrency,
        origin: report.origin,
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        waves: report.waves,
        userAgent: report.userAgent,
      },
    });

    await cleanupLoadTestEvent(eventId);
    return { success: true };
  } catch (err) {
    // Still try to clean up ephemeral data even if audit write fails.
    try {
      await cleanupLoadTestEvent(eventId);
    } catch {
      /* ignore */
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to finalize load test.",
    };
  }
}

/** Best-effort cleanup if the client aborts before finalize. */
export async function abortLoadTest(
  eventId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    assertLoadTestEnabled();
    await requireSession();
    await cleanupLoadTestEvent(eventId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to abort load test cleanup.",
    };
  }
}
