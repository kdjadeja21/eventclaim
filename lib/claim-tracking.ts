import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { CouponKind } from "@/lib/types";

export type GrantClaimSource = "copy" | "redeem_redirect";

export async function writeGrantClaimedAudit(params: {
  eventId: string;
  attendeeId: string;
  email: string;
  couponId: string;
  couponName: string;
  kind: CouponKind;
  claimedAt: string;
  source: GrantClaimSource;
  linkId?: string;
}): Promise<void> {
  const { eventId, attendeeId, email, couponId, couponName, kind, claimedAt, source, linkId } =
    params;

  await writeAuditLog({
    eventId,
    action: "grant_claimed",
    metadata: {
      attendeeId,
      email,
      couponId,
      couponName,
      kind,
      claimedAt,
      source,
      ...(linkId ? { linkId } : {}),
    },
  });
}

export async function getCouponClaimMetadata(
  eventId: string,
  couponId: string
): Promise<{ couponName: string; kind: CouponKind }> {
  const couponSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons")
    .doc(couponId)
    .get();

  if (!couponSnap.exists) {
    return { couponName: couponId, kind: "sharedCode" };
  }

  const coupon = couponSnap.data()!;
  return {
    couponName: (coupon.name as string) ?? couponId,
    kind: (coupon.kind as CouponKind) ?? "sharedCode",
  };
}
