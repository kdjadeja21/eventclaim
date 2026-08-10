import { NextResponse } from "next/server";
import { getEventCountStats } from "@/lib/event-stats";
import { requireSession } from "@/lib/session";
import { listRecentEventsForUser } from "@/lib/db/repos/events";
import { listAuditLogsForUser } from "@/lib/db/repos/audit";
import { Event } from "@/lib/types";

export interface DashboardData {
  totalAttendees: number;
  totalCoupons: number;
  totalGranted: number;
  totalEmailsSent: number;
  totalClaimed: number;
  overallClaimRate: number;
  perEventStats: {
    event: Event;
    attendees: number;
    granted: number;
    sent: number;
    claimed: number;
    claimRate: number;
  }[];
  recentActivity: {
    id: string;
    action: string;
    timestamp: string;
    eventId: string | null;
    metadata: Record<string, unknown>;
  }[];
}

async function fetchDashboardData(sessionUid: string): Promise<DashboardData> {
  const events = await listRecentEventsForUser(sessionUid, 10);

  const eventStatsResults = await Promise.all(
    events.map(async (event) => {
      const stats = await getEventCountStats(event.id);
      return { event, stats };
    })
  );

  let totalAttendees = 0;
  let totalCouponDefs = 0;
  let totalGranted = 0;
  let totalEmailsSent = 0;
  let totalClaimed = 0;

  const perEventStats = eventStatsResults.map(({ event, stats }) => {
    totalAttendees += stats.totalAttendees;
    totalCouponDefs += stats.totalCouponDefs;
    totalGranted += stats.totalGranted;
    totalEmailsSent += stats.totalEmailsSent;
    totalClaimed += stats.totalClaimed;

    return {
      event,
      attendees: stats.totalAttendees,
      granted: stats.totalGranted,
      sent: stats.totalEmailsSent,
      claimed: stats.totalClaimed,
      claimRate: stats.claimRate,
    };
  });

  const auditLogs = await listAuditLogsForUser(sessionUid, 5);
  const recentActivity = auditLogs.map((l) => ({
    id: l.id,
    action: l.action,
    timestamp: l.timestamp,
    eventId: l.eventId,
    metadata: l.metadata,
  }));

  return {
    totalAttendees,
    totalCoupons: totalCouponDefs,
    totalGranted,
    totalEmailsSent,
    totalClaimed,
    overallClaimRate:
      totalGranted > 0 ? (totalClaimed / totalGranted) * 100 : 0,
    perEventStats,
    recentActivity,
  };
}

/**
 * Serves the dashboard overview data.
 *
 * The dashboard is a read-heavy admin view, so instead of letting a Firestore
 * failure (e.g. `RESOURCE_EXHAUSTED` when the quota is exceeded) crash the
 * whole page, we catch it here and return a 503. The client keeps whatever it
 * last cached in `localStorage` and shows that instead of a hard error.
 */
export async function GET() {
  let sessionUid: string;
  try {
    const session = await requireSession();
    sessionUid = session.uid;
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const data = await fetchDashboardData(sessionUid);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/dashboard] Failed to load dashboard data:", error);
    return NextResponse.json(
      {
        error: "UNAVAILABLE",
        message:
          error instanceof Error ? error.message : "Failed to load dashboard data",
      },
      { status: 503 }
    );
  }
}
