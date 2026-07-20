"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  isQuotaExhaustedError,
  isFirestoreUnavailable,
} from "@/lib/firestore-errors";

type ErrorBoundaryFallbackProps = {
  error: Error & { digest?: string };
  /** Next.js 16 recovery: re-fetch and re-render the segment. */
  onRetry: () => void;
  title?: string;
};

/**
 * Friendly, quota-aware fallback for route-segment error boundaries. Detects
 * Firestore quota exhaustion / unavailability from the error message and shows
 * appropriate copy instead of a raw crash.
 */
export function ErrorBoundaryFallback({
  error,
  onRetry,
  title = "Something went wrong",
}: ErrorBoundaryFallbackProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const quota = isQuotaExhaustedError(error);
  const unavailable = quota || isFirestoreUnavailable(error);

  const heading = quota
    ? "Database quota exceeded"
    : unavailable
    ? "Database temporarily unavailable"
    : title;

  const message = quota
    ? "The database quota has been exceeded. This is temporary — please try again shortly."
    : unavailable
    ? "We couldn't reach the database right now. Please try again in a moment."
    : "An unexpected error occurred. You can try again, and if it keeps happening please contact an administrator.";

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </span>
          <div className="space-y-1.5">
            <h2 className="font-semibold">{heading}</h2>
            <p className="text-muted-foreground text-sm">{message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default ErrorBoundaryFallback;
