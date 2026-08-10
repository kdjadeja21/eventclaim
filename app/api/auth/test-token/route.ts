import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getTestLoginUser, isTestLoginEnabled } from "@/lib/auth/test-login-config";

export async function POST() {
  if (!isTestLoginEnabled()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { uid, email } = getTestLoginUser();
    const customToken = await adminAuth.createCustomToken(uid, { email });
    return NextResponse.json({ customToken });
  } catch (err) {
    console.error("Test login token error:", err);
    return NextResponse.json({ error: "Failed to create test token" }, { status: 500 });
  }
}
