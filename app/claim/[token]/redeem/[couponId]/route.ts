import { NextRequest, NextResponse } from "next/server";
import { markGrantClaimedByToken } from "@/lib/claim-tracking";

type Params = {
  token: string;
  couponId: string;
};

function claimPageUrl(request: NextRequest, token: string) {
  return new URL(`/claim/${encodeURIComponent(token)}`, request.url);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> | Params }
) {
  const { token, couponId } = await Promise.resolve(context.params);

  if (!token || !couponId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const result = await markGrantClaimedByToken(token, couponId, "redeem_redirect");

  if (!result.success || !result.found || !result.targetValue) {
    return NextResponse.redirect(claimPageUrl(request, token));
  }

  try {
    const destination = new URL(result.targetValue);
    return NextResponse.redirect(destination);
  } catch {
    return NextResponse.redirect(claimPageUrl(request, token));
  }
}
