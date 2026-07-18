import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getEventCountStats } from "@/lib/event-stats";
import { requireSession } from "@/lib/session";
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

async function fetchDashboardData(): Promise<DashboardData> {
  const eventsSnap = await adminDb
    .collection("events")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  const events = eventsSnap.docs.map((d) => d.data() as Event);

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

  const auditSnap = await adminDb
    .collection("auditLogs")
    .orderBy("timestamp", "desc")
    .limit(5)
    .get();

  const recentActivity = auditSnap.docs.map((d) => ({
    id: d.id,
    action: d.data().action as string,
    timestamp: d.data().timestamp as string,
    eventId: d.data().eventId as string | null,
    metadata: d.data().metadata as Record<string, unknown>,
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
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const data = await fetchDashboardData();
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
