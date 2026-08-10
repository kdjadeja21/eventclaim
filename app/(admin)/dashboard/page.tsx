import DashboardClient from "./dashboard-client";

// Dashboard data is fetched client-side from `/api/dashboard`, with the last
// successful response cached in `localStorage` so the page keeps rendering
// (slightly stale) when the live request fails.
export default function DashboardPage() {
  return <DashboardClient />;
}
