import DashboardClient from "./dashboard-client";

// The dashboard used to fetch everything from Firestore on the server on
// every request, which meant a single Firestore quota hiccup
// (`RESOURCE_EXHAUSTED`) would take the whole page down. Data fetching now
// happens client-side against `/api/dashboard`, with the last successful
// response cached in `localStorage` so the dashboard keeps rendering
// (slightly stale) instead of crashing when Firestore is unavailable.
export default function DashboardPage() {
  return <DashboardClient />;
}
