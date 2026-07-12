import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  getCouponClaimMetadata,
  writeGrantClaimedAudit,
} from "@/lib/claim-tracking";
import { Attendee, ClaimToken, Grant } from "@/lib/types";

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

  const tokenDoc = await adminDb.collection("claimTokens").doc(token).get();
  if (!tokenDoc.exists) {
    return NextResponse.redirect(claimPageUrl(request, token));
  }

  const { eventId, attendeeId } = tokenDoc.data() as ClaimToken;

  const grantRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId)
    .collection("grants")
    .doc(couponId);

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  let targetUrl: string | null = null;
  let newlyClaimed = false;
  let claimedAt = "";
  let attendeeEmail = "";
  let linkId: string | undefined;

  try {
    await adminDb.runTransaction(async (txn) => {
      const [grantSnap, attendeeSnap] = await Promise.all([
        txn.get(grantRef),
        txn.get(attendeeRef),
      ]);

      if (!grantSnap.exists || !attendeeSnap.exists) return;

      const grant = grantSnap.data() as Grant;
      targetUrl = grant.value;

      if (grant.status === "claimed") return;

      const attendee = attendeeSnap.data() as Attendee;
      newlyClaimed = true;
      const now = new Date().toISOString();
      claimedAt = now;
      attendeeEmail = attendee.email;
      linkId = grant.linkId;

      txn.update(grantRef, { status: "claimed", claimedAt: now });
      txn.update(attendeeRef, {
        claimedAny: true,
        claimedCount: FieldValue.increment(1),
      });

      if (grant.linkId) {
        const linkRef = adminDb
          .collection("events")
          .doc(eventId)
          .collection("coupons")
          .doc(couponId)
          .collection("links")
          .doc(grant.linkId);
        txn.update(linkRef, { status: "claimed", claimedAt: now });
      }
    });
  } catch {
    return NextResponse.redirect(claimPageUrl(request, token));
  }

  if (!targetUrl) {
    return NextResponse.redirect(claimPageUrl(request, token));
  }

  try {
    const destination = new URL(targetUrl);

    if (newlyClaimed) {
      const { couponName, kind } = await getCouponClaimMetadata(eventId, couponId);
      await writeGrantClaimedAudit({
        eventId,
        attendeeId,
        email: attendeeEmail,
        couponId,
        couponName,
        kind,
        claimedAt,
        source: "redeem_redirect",
        linkId,
      });
    }

    return NextResponse.redirect(destination);
  } catch {
    return NextResponse.redirect(claimPageUrl(request, token));
  }
}
