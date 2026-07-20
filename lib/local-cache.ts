/**
 * Small helper around `localStorage` used to keep the last-known-good copy of
 * data that would otherwise be fetched from Firestore on every render.
 *
 * This lets read-heavy admin views keep working (showing slightly stale data)
 * when Firestore is unavailable or its quota has been exhausted, instead of
 * crashing the whole page with an unhandled server error.
 */

interface CacheEnvelope<T> {
  data: T;
  cachedAt: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readLocalCache<T>(key: string): { data: T; cachedAt: string } | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || !("data" in parsed)) return null;
    return { data: parsed.data, cachedAt: parsed.cachedAt };
  } catch {
    return null;
  }
}

export function writeLocalCache<T>(key: string, data: T): void {
  if (!isBrowser()) return;
  try {
    const envelope: CacheEnvelope<T> = { data, cachedAt: new Date().toISOString() };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Storage full / disabled — silently ignore, caching is best-effort only.
  }
}

export function clearLocalCache(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Removes every cache entry whose key starts with `prefix`. Used on logout to
 * avoid leaving admin data behind in the browser.
 */
export function clearLocalCacheByPrefix(prefix: string): void {
  if (!isBrowser()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
}
