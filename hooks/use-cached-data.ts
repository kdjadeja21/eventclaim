"use client";

import { useCallback, useEffect, useState } from "react";
import { readLocalCache, writeLocalCache } from "@/lib/local-cache";

export type CachedDataState<T> = {
  /** The data to render — from the live fetch, or the cache during an outage. */
  data: T | null;
  /** ISO timestamp of when `data` was produced/cached. */
  cachedAt: string | null;
  /** True when the live fetch failed and we're showing cached data instead. */
  isStale: boolean;
  /** True while the very first load is in flight and nothing is renderable yet. */
  loading: boolean;
  /** Friendly error message when there's no data to show at all. */
  error: string | null;
  /** Manually re-run the fetch (used by retry buttons). */
  refresh: () => void;
};

/**
 * Generic resilient data hook. Mirrors the dashboard pattern so any read view
 * keeps working during a Firestore outage:
 *
 * 1. On mount, read the last successful response from localStorage and render
 *    it immediately (instant load, works offline).
 * 2. Fetch fresh data from `url`. On success, update the UI and overwrite the
 *    cache. On failure (e.g. Firestore quota exhausted), keep the cached data
 *    and flag it as stale instead of crashing.
 *
 * The cache is scoped by `cacheKey`, so different views never collide.
 */
export function useCachedData<T>(cacheKey: string, url: string): CachedDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = readLocalCache<T>(cacheKey);

    async function load() {
      // Apply the browser-only localStorage cache after mount (keeps SSR/CSR
      // hydration identical). Syncing with an external system, so it's safe.
      if (cached && !cancelled) {
        setData(cached.data);
        setCachedAt(cached.cachedAt);
        setLoading(false);
      }

      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed with ${res.status}`);
        const fresh = (await res.json()) as T;
        if (cancelled) return;
        setData(fresh);
        setCachedAt(new Date().toISOString());
        setIsStale(false);
        setError(null);
        writeLocalCache(cacheKey, fresh);
      } catch {
        if (cancelled) return;
        if (cached) {
          // Fall back to the last known-good data.
          setIsStale(true);
        } else {
          setError(
            "This data is temporarily unavailable. Please try again in a moment."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, url, reloadToken]);

  return { data, cachedAt, isStale, loading, error, refresh };
}
