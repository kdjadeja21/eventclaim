import "server-only";
import { nanoid } from "nanoid";
import { insertEvent, deleteEventCascade } from "@/lib/db/repos/events";
import { bulkInsertAttendees, listAttendeesForEvent } from "@/lib/db/repos/attendees";
import { insertCoupon } from "@/lib/db/repos/coupons";
import { bulkInsertCouponLinks } from "@/lib/db/repos/links";
import { assignPendingForEvent } from "@/lib/db/repos/grants";
import {
  assertLoadTestEnabled,
  clampLoadTestConcurrency,
} from "@/lib/load-test-config";
import type { PrepareLoadTestResult } from "@/lib/load-test-types";

export type {
  CapacityWaveReport,
  CapacityTestReport,
  PrepareLoadTestResult,
} from "@/lib/load-test-types";

/**
 * Seeds a disposable event with `count` attendees and two offers
 * (uniqueLink + sharedLink for redeem redirects). Real events are never touched.
 */
export async function prepareLoadTestEvent(count: number): Promise<PrepareLoadTestResult> {
  assertLoadTestEnabled();
  const concurrency = clampLoadTestConcurrency(count);
  const now = new Date().toISOString();
  const stamp = Date.now();
  const eventId = `evt_loadtest_${stamp}`;
  const uniqueCouponId = `cpn_loadtest_unique_${stamp}`;
  const sharedLinkCouponId = `cpn_loadtest_shared_${stamp}`;

  await insertEvent({
    id: eventId,
    name: `Load Test ${stamp}`,
    slug: `load-test-${stamp}`,
    date: now.slice(0, 10),
    notionGuideUrl: "",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  try {
    await bulkInsertAttendees(
      Array.from({ length: concurrency }, (_, i) => ({
        id: `att_loadtest_${stamp}_${i}`,
        eventId,
        name: `Load Test Attendee ${i}`,
        email: `loadtest-${stamp}-${i}@example.com`,
        createdAt: now,
      }))
    );

    await insertCoupon({
      id: uniqueCouponId,
      eventId,
      name: "Load Test Unique Credits",
      kind: "uniqueLink",
      category: "CREDITS",
      logoUrl: "",
      highlight: "Load test",
      description: "Ephemeral unique-link offer for capacity testing",
      sortOrder: 0,
      isDisabled: false,
      createdAt: now,
      linkTotal: 0,
      linkAvailable: 0,
    });

    await bulkInsertCouponLinks(
      Array.from({ length: concurrency }, (_, i) => ({
        id: `lnk_loadtest_${stamp}_${i}`,
        couponId: uniqueCouponId,
        eventId,
        url: `https://partner.example/load-test/${stamp}/${i}`,
      }))
    );

    await insertCoupon({
      id: sharedLinkCouponId,
      eventId,
      name: "Load Test Shared Link",
      kind: "sharedLink",
      category: "LINK",
      logoUrl: "",
      highlight: "Load test",
      description: "Ephemeral shared-link offer for capacity testing",
      sharedValue: "https://partner.example/load-test/shared",
      redeemUrl: "https://partner.example/load-test/shared",
      sortOrder: 1,
      isDisabled: false,
      createdAt: now,
    });

    await assignPendingForEvent(eventId);

    const attendees = await listAttendeesForEvent(eventId);
    const tokens = attendees
      .map((a) => a.claimToken)
      .filter((t): t is string => !!t);

    if (tokens.length < concurrency) {
      throw new Error(
        `Expected ${concurrency} claim tokens after assignment, got ${tokens.length}`
      );
    }

    return {
      eventId,
      redeemCouponId: uniqueCouponId,
      tokens: tokens.slice(0, concurrency),
      concurrency,
    };
  } catch (err) {
    // Don't leave a half-seeded event behind if prepare fails mid-way.
    try {
      await deleteEventCascade(eventId);
    } catch {
      /* ignore cleanup errors */
    }
    throw err;
  }
}

export async function cleanupLoadTestEvent(eventId: string): Promise<void> {
  assertLoadTestEnabled();
  if (!eventId.startsWith("evt_loadtest_")) {
    throw new Error("Refusing to delete a non-load-test event.");
  }
  await deleteEventCascade(eventId);
}

/** Stable id helper if callers need one outside prepare. */
export function newLoadTestId(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}
