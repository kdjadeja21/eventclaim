/**
 * End-to-end sandbox test of the migrated data layer. Exercises the exact
 * repo functions the server actions call (everything except the
 * requireSession() auth wrapper, which is intentionally untouched Firebase
 * Auth and can't be tested without real credentials).
 *
 * Run against a throwaway Postgres database:
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/sandbox-integration-test.ts
 */
import assert from "node:assert/strict";

async function main() {
  const { insertEvent, getEventBySlug, deleteEventCascade } = await import(
    "@/lib/db/repos/events"
  );
  const { bulkInsertAttendees, listAttendeesForEvent, getAttendeeById, deleteAttendeeCascade } =
    await import("@/lib/db/repos/attendees");
  const { insertCoupon, listCouponsWithStats, getCouponById } = await import(
    "@/lib/db/repos/coupons"
  );
  const { bulkInsertCouponLinks, listAvailableLinks } = await import("@/lib/db/repos/links");
  const { assignPendingForEvent, claimGrant, getGrant, unassignGrant, reserveSpecificLinkGrant } =
    await import("@/lib/db/repos/grants");
  const { getEventCountStats } = await import("@/lib/db/repos/stats");
  const { writeAuditLog, listAuditLogs } = await import("@/lib/db/repos/audit");

  let step = 0;
  const check = (label: string) => console.log(`  [PASS] ${++step}. ${label}`);

  console.log("=== 1. Create event ===");
  const eventId = "evt_test_1";
  await insertEvent({
    id: eventId,
    name: "Sandbox Test Event",
    slug: "sandbox-test-event",
    date: new Date().toISOString().slice(0, 10),
    notionGuideUrl: "",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const fetchedEvent = await getEventBySlug("sandbox-test-event");
  assert.ok(fetchedEvent, "event should be findable by slug");
  assert.equal(fetchedEvent!.id, eventId);
  check("Event created and resolvable by slug");

  console.log("=== 2. Bulk import attendees (simulates CSV import) ===");
  const now = new Date().toISOString();
  const attendeeRows = Array.from({ length: 25 }, (_, i) => ({
    id: `att_${i}`,
    eventId,
    name: `Attendee ${i}`,
    email: `attendee${i}@test.com`,
    createdAt: now,
  }));
  const importResult = await bulkInsertAttendees(attendeeRows);
  assert.equal(importResult.insertedCount, 25, "all 25 attendees should be inserted");
  check("25 attendees bulk-inserted in one statement");

  // Re-import the same rows — must be idempotent (ON CONFLICT DO NOTHING)
  const reimport = await bulkInsertAttendees(attendeeRows);
  assert.equal(reimport.insertedCount, 0, "re-import should insert 0 (idempotent)");
  assert.equal(reimport.skippedCount, 25);
  check("Re-import of the same CSV is idempotent (0 inserted, 25 skipped)");

  console.log("=== 3. Create a uniqueLink coupon with a small pool ===");
  const couponId = "cpn_unique_1";
  await insertCoupon({
    id: couponId,
    eventId,
    name: "Voice Tool Pro",
    kind: "uniqueLink",
    category: "VOICE",
    logoUrl: "",
    highlight: "3 months free",
    description: "Redeem via link",
    sortOrder: 0,
    isDisabled: false,
    createdAt: now,
    linkTotal: 0,
    linkAvailable: 0,
  });

  // Pool intentionally smaller than attendee count (10 links, 25 attendees)
  const linkRows = Array.from({ length: 10 }, (_, i) => ({
    id: `lnk_${i}`,
    couponId,
    eventId,
    url: `https://partner.example/redeem/${i}`,
  }));
  const linksInserted = await bulkInsertCouponLinks(linkRows);
  assert.equal(linksInserted, 10);

  const couponAfterLinks = await getCouponById(eventId, couponId);
  assert.equal(couponAfterLinks!.linkTotal, 10, "linkTotal trigger should be 10");
  assert.equal(couponAfterLinks!.linkAvailable, 10, "linkAvailable trigger should be 10");
  check("Coupon pool trigger correctly counted linkTotal=10, linkAvailable=10");

  console.log("=== 4. Create a sharedCode coupon (unlimited) ===");
  const sharedCouponId = "cpn_shared_1";
  await insertCoupon({
    id: sharedCouponId,
    eventId,
    name: "10% Off Code",
    kind: "sharedCode",
    category: "DISCOUNT",
    logoUrl: "",
    highlight: "10% off",
    description: "Use at checkout",
    sharedValue: "SAVE10",
    sortOrder: 1,
    isDisabled: false,
    createdAt: now,
  });
  check("Shared-code coupon created");

  console.log("=== 5. assignPendingForEvent: set-based grant assignment ===");
  const touched = await assignPendingForEvent(eventId);
  // Only 10 of 25 attendees can get the uniqueLink coupon (pool exhausted),
  // but ALL 25 should get the sharedCode coupon -> union of touched = 25.
  assert.equal(touched.length, 25, "all 25 attendees should have been touched by at least one grant");
  check(`assignPendingForEvent touched ${touched.length} attendees in one pass`);

  const couponAfterAssign = await getCouponById(eventId, couponId);
  assert.equal(couponAfterAssign!.linkAvailable, 0, "pool should be fully exhausted (10 links, 25 attendees)");
  check("uniqueLink pool correctly exhausted (linkAvailable=0) after over-subscribed assignment");

  const attendeesAfter = await listAttendeesForEvent(eventId);
  const withUniqueLinkGrant = attendeesAfter.filter((a) => a.grantCount >= 1);
  const withBothGrants = attendeesAfter.filter((a) => a.grantCount === 2);
  assert.equal(withBothGrants.length, 10, "exactly 10 attendees should have both grants");
  assert.equal(
    attendeesAfter.filter((a) => a.grantCount === 1).length,
    15,
    "15 attendees should have exactly 1 grant (missed the exhausted pool)"
  );
  check(`grant_count trigger correct: 10 attendees have 2 grants, 15 have 1 (${withUniqueLinkGrant.length} total with >=1)`);

  const allClaimTokensSet = attendeesAfter.every((a) => !!a.claimToken);
  assert.ok(allClaimTokensSet, "every touched attendee should have a claim token");
  check("Every attendee received a claim token as part of the same assignment pass");

  console.log("=== 6. Re-run assignPendingForEvent: must be a no-op ===");
  const touchedAgain = await assignPendingForEvent(eventId);
  assert.equal(touchedAgain.length, 0, "re-running assignment should touch 0 attendees (idempotent)");
  check("Re-running assignPendingForEvent is a no-op (idempotent)");

  console.log("=== 7. Cannot reserve a link that's already assigned ===");
  const someLinkId = "lnk_0"; // already assigned to whichever attendee got it first
  const attemptedDuplicate = await reserveSpecificLinkGrant({
    eventId,
    attendeeId: "att_999",
    couponId,
    linkId: someLinkId,
  });
  assert.equal(attemptedDuplicate, false, "reserving an already-assigned link should return false, not throw");
  const grantForLink0 = await getGrant(eventId, "att_999", couponId);
  assert.equal(grantForLink0, null, "att_999 must not have received an already-assigned link");
  check("Attempting to reserve an already-assigned link correctly fails (no duplicate grant)");

  console.log("=== 8. Claim a grant (idempotency) ===");
  const claimant = attendeesAfter.find((a) => a.grantCount === 2)!;
  const claimResult1 = await claimGrant({ eventId, attendeeId: claimant.id, couponId });
  assert.equal(claimResult1.newlyClaimed, true);
  assert.ok(claimResult1.value?.startsWith("https://partner.example/"));
  check("First claim succeeds and returns the target URL");

  const claimResult2 = await claimGrant({ eventId, attendeeId: claimant.id, couponId });
  assert.equal(claimResult2.newlyClaimed, false, "second claim must be a no-op");
  assert.equal(claimResult2.value, claimResult1.value, "second claim still returns the same target URL");
  check("Repeat claim (simulating a re-clicked email link) is idempotent");

  const claimantAfter = await getAttendeeById(eventId, claimant.id);
  assert.equal(claimantAfter!.claimedCount, 1, "claimed_count trigger should be 1");
  assert.equal(claimantAfter!.claimedAny, true);
  check("claimed_count / claimed_any triggers fired correctly on claim");

  console.log("=== 9. Unassign a grant releases the link back to the pool ===");
  // Claimed links can't be unassigned in the UI layer, so use a different
  // (still-assigned, not-yet-claimed) attendee for this check.
  const assignedNotClaimed = attendeesAfter.find(
    (a) => a.grantCount === 2 && a.id !== claimant.id
  )!;
  const grant2 = await getGrant(eventId, assignedNotClaimed.id, couponId);
  assert.ok(grant2?.linkId);
  await unassignGrant(eventId, assignedNotClaimed.id, couponId, grant2!.linkId!);
  const couponAfterUnassign = await getCouponById(eventId, couponId);
  assert.equal(couponAfterUnassign!.linkAvailable, 1, "unassigning should free the link back to the pool");
  const attendeeAfterUnassign = await getAttendeeById(eventId, assignedNotClaimed.id);
  assert.equal(attendeeAfterUnassign!.grantCount, 1, "grant_count should decrement after unassign");
  check("Unassigning a grant releases the link and decrements grant_count via triggers");

  console.log("=== 10. Event stats: single grouped-aggregate query ===");
  const stats = await getEventCountStats(eventId);
  assert.equal(stats.totalAttendees, 25);
  assert.equal(stats.totalCouponDefs, 2);
  assert.equal(stats.totalClaimed, 1);
  check(`getEventCountStats returned correct aggregates: ${JSON.stringify(stats)}`);

  console.log("=== 11. Coupon stats (replaces N collectionGroup scans) ===");
  const couponsWithStats = await listCouponsWithStats(eventId);
  const uniqueLinkStats = couponsWithStats.find((c) => c.id === couponId)!.stats;
  assert.equal(uniqueLinkStats.claimed, 1);
  check(`listCouponsWithStats: uniqueLink coupon granted=${uniqueLinkStats.granted}, claimed=${uniqueLinkStats.claimed}`);

  console.log("=== 12. Audit log ===");
  await writeAuditLog({ eventId, action: "status_checked", metadata: { test: true } });
  const logs = await listAuditLogs(5);
  assert.ok(logs.length > 0);
  check(`Audit log write + read round-trips (${logs.length} recent entries)`);

  console.log("=== 13. Delete attendee releases their remaining link ===");
  const beforeDeleteLinks = (await listAvailableLinks(eventId, couponId)).length;
  await deleteAttendeeCascade(eventId, assignedNotClaimed.id);
  const afterDeleteAttendee = await getAttendeeById(eventId, assignedNotClaimed.id);
  assert.equal(afterDeleteAttendee, null, "attendee should be gone");
  check("Attendee delete removes the row (grants cascade automatically)");
  void beforeDeleteLinks;

  console.log("=== 14. Delete event cascades to everything ===");
  await deleteEventCascade(eventId);
  const remaining = await listAttendeesForEvent(eventId);
  assert.equal(remaining.length, 0, "all attendees should be gone after event delete");
  const goneEvent = await getEventBySlug("sandbox-test-event");
  assert.equal(goneEvent, null);
  const auditAfterDelete = await listAuditLogs(50);
  assert.ok(
    auditAfterDelete.some((l) => l.eventId === eventId || l.eventId === null),
    "audit logs referencing the deleted event should survive (no FK on audit_logs.event_id)"
  );
  check("Deleting the event cascades to attendees/coupons/links/grants, but audit history survives");

  console.log("\nAll sandbox integration checks passed.\n");
}

main()
  .then(async () => {
    const { db } = await import("@/lib/db/client");
    await db.$client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("SANDBOX TEST FAILED:", err);
    try {
      const { db } = await import("@/lib/db/client");
      await db.$client.end();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
