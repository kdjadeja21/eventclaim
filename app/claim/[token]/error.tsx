"use client";

import { ErrorBoundaryFallback } from "@/components/error-boundary-fallback";

export default function ClaimError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorBoundaryFallback
      error={error}
      onRetry={unstable_retry}
      title="We couldn't load your offers"
    />
  );
}
