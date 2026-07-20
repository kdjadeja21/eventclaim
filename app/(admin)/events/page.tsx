import EventsClient from "./events-client";

// Events are fetched client-side from /api/events and cached in localStorage,
// so the list stays viewable (from the last successful load) even when
// Firestore is unavailable or its quota is exhausted.
export default function EventsPage() {
  return <EventsClient />;
}
