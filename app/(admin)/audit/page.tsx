import AuditClient from "./audit-client";

// Data is fetched client-side from /api/audit and cached in localStorage, so
// the log stays viewable (from the last successful load) even if Firestore is
// unavailable or its quota is exhausted.
export default function AuditPage() {
  return <AuditClient />;
}
