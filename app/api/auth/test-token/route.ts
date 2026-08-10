import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { getTestLoginUser, isTestLoginEnabled } from "@/lib/auth/test-login-config";

/** Ensure the dedicated test-login user exists with a stable UID + email. */
async function ensureTestLoginUser(uid: string, email: string): Promise<void> {
  try {
    await adminAuth.updateUser(uid, { email, emailVerified: true });
  } catch {
    await adminAuth.createUser({
      uid,
      email,
      emailVerified: true,
      displayName: "Test Login",
    });
  }
}

export async function POST() {
  if (!isTestLoginEnabled()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { uid, email } = getTestLoginUser();
    await ensureTestLoginUser(uid, email);
    const customToken = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ customToken });
  } catch (err) {
    console.error("Test login token error:", err);
    return NextResponse.json({ error: "Failed to create test token" }, { status: 500 });
  }
}
