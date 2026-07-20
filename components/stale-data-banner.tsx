"use client";

import { AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

type StaleDataBannerProps = {
  cachedAt?: string | null;
};

/**
 * Amber notice shown when the live fetch failed and we're rendering the last
 * successful data cached in localStorage instead.
 */
export function StaleDataBanner({ cachedAt }: StaleDataBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>
        Showing data last updated {cachedAt ? formatDateTime(cachedAt) : "earlier"}{" "}
        — live data is temporarily unavailable.
      </span>
    </div>
  );
}

export default StaleDataBanner;
