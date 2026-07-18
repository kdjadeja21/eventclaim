import { ConfirmationAttendee, ConfirmationSuggestedLink } from "@/lib/confirmation/types";
import { normalizeEmail } from "@/lib/utils";

// ─── Fuzzy email matching ───────────────────────────────────────────────────────
// Suggests corrections when a team lead/teammate typo'd an email address, so
// admins can review + confirm a likely match instead of the team silently
// staying broken (needs_review) forever.

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function localPartSimilarity(a: string, b: string): number {
  const [localA, domainA] = a.split("@");
  const [localB, domainB] = b.split("@");
  if (!localA || !localB || !domainA || !domainB) return 0;
  if (domainA !== domainB) {
    const domainDist = levenshtein(domainA, domainB);
    if (domainDist > 2) return 0;
  }
  const dist = levenshtein(localA, localB);
  const maxLen = Math.max(localA.length, localB.length);
  if (maxLen === 0) return 0;
  return 1 - dist / maxLen;
}

function buildReason(fromEmail: string, toEmail: string, dist: number): string {
  const [fromLocal] = fromEmail.split("@");
  const [toLocal] = toEmail.split("@");
  const localDist = levenshtein(fromLocal ?? "", toLocal ?? "");
  if (localDist <= 2) {
    return `Typo in email local part (${localDist} character${localDist === 1 ? "" : "s"} off)`;
  }
  if (dist <= 2) {
    return `Possible typo (${dist} edit${dist === 1 ? "" : "s"} away)`;
  }
  return "Similar email address";
}

/**
 * Finds attendees whose email is a close match for `unmatchedEmail` — i.e.
 * someone likely typo'd a teammate's email in the CSV. Matches on either a
 * small overall edit distance or high local-part similarity (same domain).
 */
export function findSuggestions(
  unmatchedEmail: string,
  candidates: ConfirmationAttendee[],
  threshold = 2,
  maxResults = 3
): ConfirmationSuggestedLink[] {
  const target = normalizeEmail(unmatchedEmail);
  const suggestions: ConfirmationSuggestedLink[] = [];

  for (const candidate of candidates) {
    const candidateEmail = normalizeEmail(candidate.email);
    if (candidateEmail === target) continue;

    const dist = levenshtein(target, candidateEmail);
    const similarity = localPartSimilarity(target, candidateEmail);

    if (dist <= threshold || similarity >= 0.85) {
      const score = Math.max(
        similarity,
        1 - dist / Math.max(target.length, candidateEmail.length)
      );
      suggestions.push({
        fromEmail: target,
        toAttendeeId: candidate.id,
        toEmail: candidateEmail,
        score,
        reason: buildReason(target, candidateEmail, dist),
      });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, maxResults);
}
