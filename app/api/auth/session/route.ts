import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { createSession } from "@/lib/session";
import { resolveSignInAccess } from "@/lib/db/repos/portal-users";

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "idToken required" }, { status: 400 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "Google account email is required", status: "denied" },
        { status: 403 }
      );
    }

    const decision = await resolveSignInAccess({
      email,
      firebaseUid: decoded.uid,
      displayName: decoded.name ?? null,
    });

    if (decision.status !== "approved") {
      // Do NOT issue an admin session cookie for pending/denied/revoked.
      return NextResponse.json(
        {
          ok: false,
          status: decision.status,
          error:
            decision.status === "pending"
              ? "Access request submitted. Waiting for approval."
              : "Access denied.",
        },
        { status: 403 }
      );
    }

    await createSession(idToken);
    return NextResponse.json({ ok: true, status: "approved" });
  } catch (err) {
    console.error("Session creation error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
