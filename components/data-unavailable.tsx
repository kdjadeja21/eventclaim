"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DataUnavailableProps = {
  title?: string;
  message?: string;
  /** Optional retry handler. When provided, a "Try again" button is shown. */
  onRetry?: () => void;
};

/**
 * Shared fallback shown when data cannot be loaded (e.g. Firestore quota
 * exhausted) and there is no cached copy to fall back to.
 */
export function DataUnavailable({
  title = "Data is temporarily unavailable",
  message = "We couldn't reach the database right now. This is usually temporary — please try again in a moment.",
  onRetry,
}: DataUnavailableProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </span>
        <div className="space-y-1">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-xs max-w-sm">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default DataUnavailable;
