"use server";

import { markGrantClaimedByToken, getClaimPageData as getClaimPageDataImpl } from "@/lib/claim-tracking";

export async function markGrantClaimed(
  token: string,
  couponId: string
): Promise<{ success: boolean; error?: string }> {
  const result = await markGrantClaimedByToken(token, couponId, "copy");
  return { success: result.success, error: result.error };
}

export async function getClaimPageData(token: string) {
  return getClaimPageDataImpl(token);
}
