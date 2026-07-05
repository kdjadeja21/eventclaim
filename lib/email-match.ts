import { normalizeEmail } from "@/lib/utils";

export interface EmailMatchCandidate {
  email: string;
  registrationId: string;
  score: number;
  reason: string;
}

/** Levenshtein distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function localPart(email: string): string {
  return normalizeEmail(email).split("@")[0] ?? email;
}

function domain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

/**
 * Find fuzzy email matches for an unmatched email among registered emails.
 * Never auto-applies — suggestions only.
 */
export function suggestEmailMatches(
  unmatchedEmail: string,
  candidates: Array<{ email: string; registrationId: string }>,
  maxDistance = 2,
  maxResults = 3
): EmailMatchCandidate[] {
  const target = normalizeEmail(unmatchedEmail);
  const targetLocal = localPart(target);
  const targetDomain = domain(target);

  const results: EmailMatchCandidate[] = [];

  for (const c of candidates) {
    const candidate = normalizeEmail(c.email);
    if (candidate === target) continue;

    const candidateDomain = domain(candidate);
    if (candidateDomain !== targetDomain) continue;

    const candidateLocal = localPart(candidate);
    const distance = levenshtein(targetLocal, candidateLocal);

    if (distance > maxDistance) continue;

    const score = 1 - distance / Math.max(targetLocal.length, candidateLocal.length, 1);
    results.push({
      email: candidate,
      registrationId: c.registrationId,
      score,
      reason:
        distance === 0
          ? "Exact local-part match"
          : `Typo in email local part (${distance} character${distance === 1 ? "" : "s"} off)`,
    });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

export function resolveEmailToRegistrationId(
  email: string,
  byEmail: Map<string, { registrationId: string }>,
  confirmedAliases: Map<string, string>
): string | null {
  const normalized = normalizeEmail(email);
  const alias = confirmedAliases.get(normalized);
  if (alias) return alias;

  const direct = byEmail.get(normalized);
  return direct?.registrationId ?? null;
}
