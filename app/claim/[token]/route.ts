import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { ClaimToken, Attendee } from "@/lib/types";

type Props = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, { params }: Props) {
  const { token } = await params;

  // Look up token
  const tokenDoc = await adminDb.collection("claimTokens").doc(token).get();
  if (!tokenDoc.exists) {
    return new NextResponse("Invalid or expired claim link.", { status: 404 });
  }

  const { eventId, attendeeId } = tokenDoc.data() as ClaimToken;

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  const attendeeSnap = await attendeeRef.get();
  if (!attendeeSnap.exists) {
    return new NextResponse("Attendee not found.", { status: 404 });
  }

  const attendee = attendeeSnap.data() as Attendee;

  if (!attendee.couponLink) {
    return new NextResponse("No coupon assigned yet.", { status: 400 });
  }

  const now = new Date().toISOString();

  // Mark claimed (idempotent — already claimed is fine, just redirect)
  if (!attendee.claimed) {
    await adminDb.runTransaction(async (txn) => {
      const snap = await txn.get(attendeeRef);
      if (!snap.exists || snap.data()!.claimed) return;

      txn.update(attendeeRef, {
        claimed: true,
        claimedAt: now,
      });

      // Mark coupon claimed
      if (attendee.couponId) {
        const couponRef = adminDb
          .collection("events")
          .doc(eventId)
          .collection("coupons")
          .doc(attendee.couponId);
        txn.update(couponRef, { status: "claimed", claimedAt: now });
      }
    });

    await writeAuditLog({
      eventId,
      action: "coupon_claimed",
      metadata: {
        attendeeId,
        email: attendee.email,
        couponId: attendee.couponId,
        claimedAt: now,
      },
    });
  }

  // Redirect to the actual coupon URL
  return NextResponse.redirect(attendee.couponLink, { status: 302 });
}
