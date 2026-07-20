/**
 * Centralized detection and messaging for Firestore/Firebase failures.
 *
 * The most important case is quota exhaustion (`8 RESOURCE_EXHAUSTED`), which
 * happens when the project's Firestore free-tier / daily quota is used up. When
 * that happens neither reads nor writes can succeed, so instead of letting the
 * raw gRPC error crash a page or a server action, we detect it here and turn it
 * into a friendly, consistent message everywhere.
 */

/** gRPC status codes we care about (see https://grpc.io/docs/guides/status-codes). */
const GRPC_RESOURCE_EXHAUSTED = 8;
const GRPC_UNAVAILABLE = 14;
const GRPC_DEADLINE_EXCEEDED = 4;

function getErrorCode(err: unknown): number | string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return (err as { code?: number | string }).code;
  }
  return undefined;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "");
  }
  return "";
}

/**
 * True when the error is a Firestore quota-exhaustion error
 * (`8 RESOURCE_EXHAUSTED: Quota exceeded.`).
 */
export function isQuotaExhaustedError(err: unknown): boolean {
  const code = getErrorCode(err);
  if (code === GRPC_RESOURCE_EXHAUSTED || code === "resource-exhausted") {
    return true;
  }
  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes("resource_exhausted") ||
    message.includes("resource-exhausted") ||
    message.includes("quota exceeded")
  );
}

/**
 * True when Firestore is unavailable for any reason we should degrade
 * gracefully on: quota exhaustion plus transient network / timeout errors.
 */
export function isFirestoreUnavailable(err: unknown): boolean {
  if (isQuotaExhaustedError(err)) return true;
  const code = getErrorCode(err);
  if (
    code === GRPC_UNAVAILABLE ||
    code === GRPC_DEADLINE_EXCEEDED ||
    code === "unavailable" ||
    code === "deadline-exceeded"
  ) {
    return true;
  }
  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes("unavailable") ||
    message.includes("deadline_exceeded") ||
    message.includes("deadline-exceeded")
  );
}

/**
 * True only for transient errors that are worth retrying. Quota exhaustion is
 * deliberately excluded because retrying will not help until quota resets.
 */
export function isTransientFirestoreError(err: unknown): boolean {
  if (isQuotaExhaustedError(err)) return false;
  return isFirestoreUnavailable(err);
}

/** A user-facing message tailored to the kind of Firestore failure. */
export function getFriendlyFirestoreMessage(err: unknown): string {
  if (isQuotaExhaustedError(err)) {
    return "The database quota has been exceeded. This is temporary — please try again shortly. Any data shown may be from the last successful load.";
  }
  if (isFirestoreUnavailable(err)) {
    return "The database is temporarily unavailable. Please try again in a moment.";
  }
  return getErrorMessage(err) || "Something went wrong. Please try again.";
}

/**
 * Wraps an async function so any thrown error is normalized to
 * `{ success: false, error }` with a friendly message. Successful calls are
 * returned as `{ success: true, data }`. Useful for server actions that
 * currently let Firestore errors propagate and crash the request.
 */
export async function withFirestoreErrors<T>(
  fn: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err) {
    console.error("[firestore] operation failed:", err);
    return { success: false, error: getFriendlyFirestoreMessage(err) };
  }
}

/**
 * Retries a Firestore operation on transient errors with exponential backoff.
 * Quota-exhaustion errors are re-thrown immediately (retrying won't help).
 */
export async function retryOnTransient<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 200 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isTransientFirestoreError(err)) throw err;
      const delay = baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}
