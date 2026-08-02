import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendees, coupons } from "@/lib/db/schema";
import { EventStats } from "@/lib/types";

/**
 * Single grouped-aggregate query replaces the previous 7 separate
 * `.count().get()` calls (one full collection scan each) per event. The
 * dashboard calling this for 10 events used to cost 70 Firestore reads on
 * every page load; this is now 2 queries total regardless of event count.
 */
export async function getEventCountStats(eventId: string): Promise<EventStats> {
  const [attendeeAgg] = await db
    .select({
      totalAttendees: sql<number>`count(*)`.mapWith(Number),
      totalEmailsSent: sql<number>`count(*) filter (where ${attendees.emailStatus} = 'sent')`.mapWith(
        Number
      ),
      totalEmailsPending: sql<number>`count(*) filter (where ${attendees.emailStatus} = 'pending')`.mapWith(
        Number
      ),
      totalEmailsFailed: sql<number>`count(*) filter (where ${attendees.emailStatus} = 'failed')`.mapWith(
        Number
      ),
      totalClaimed: sql<number>`count(*) filter (where ${attendees.claimedAny})`.mapWith(Number),
      totalGranted: sql<number>`count(*) filter (where ${attendees.grantCount} > 0)`.mapWith(Number),
    })
    .from(attendees)
    .where(eq(attendees.eventId, eventId));

  const [couponAgg] = await db
    .select({ totalCouponDefs: sql<number>`count(*)`.mapWith(Number) })
    .from(coupons)
    .where(eq(coupons.eventId, eventId));

  const totalClaimed = attendeeAgg?.totalClaimed ?? 0;
  const totalGranted = attendeeAgg?.totalGranted ?? 0;

  return {
    totalAttendees: attendeeAgg?.totalAttendees ?? 0,
    totalCouponDefs: couponAgg?.totalCouponDefs ?? 0,
    totalGranted,
    totalEmailsSent: attendeeAgg?.totalEmailsSent ?? 0,
    totalEmailsPending: attendeeAgg?.totalEmailsPending ?? 0,
    totalEmailsFailed: attendeeAgg?.totalEmailsFailed ?? 0,
    totalClaimed,
    claimRate: totalGranted > 0 ? (totalClaimed / totalGranted) * 100 : 0,
  };
}
