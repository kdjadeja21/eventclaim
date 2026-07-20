"use client";

import { ErrorBoundaryFallback } from "@/components/error-boundary-fallback";

export default function AdminError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorBoundaryFallback error={error} onRetry={unstable_retry} />;
}
