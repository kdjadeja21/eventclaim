/**
 * Shared helpers for the load-test branch feature (capacity test + test auth).
 * Everything is inert unless LOAD_TEST_ENABLED=true.
 */

export const LOAD_TEST_COOKIE_PREFIX = "loadtest:";
export const LOAD_TEST_COOKIE_VALUE = "loadtest:v1";
export const LOAD_TEST_UID = "load-test";
export const LOAD_TEST_EMAIL = "load-test@eventclaim.local";

export const LOAD_TEST_MIN_CONCURRENCY = 10;
export const LOAD_TEST_MAX_CONCURRENCY = 2000;
export const LOAD_TEST_DEFAULT_CONCURRENCY = 300;

export function isLoadTestEnabled(): boolean {
  return process.env.LOAD_TEST_ENABLED === "true";
}

export function assertLoadTestEnabled(): void {
  if (!isLoadTestEnabled()) {
    throw new Error("Load test features are disabled. Set LOAD_TEST_ENABLED=true.");
  }
}

export function clampLoadTestConcurrency(raw: number): number {
  if (!Number.isFinite(raw)) return LOAD_TEST_DEFAULT_CONCURRENCY;
  return Math.min(
    LOAD_TEST_MAX_CONCURRENCY,
    Math.max(LOAD_TEST_MIN_CONCURRENCY, Math.floor(raw))
  );
}

export function isLoadTestSessionCookie(value: string | undefined | null): boolean {
  return !!value && value.startsWith(LOAD_TEST_COOKIE_PREFIX);
}
