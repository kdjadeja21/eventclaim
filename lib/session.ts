import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { isDevDataMode, DEV_SESSION_COOKIE_VALUE } from "@/lib/dev-mode";

const SESSION_COOKIE_NAME = "eventclaim_session";
const SESSION_DURATION_MS = 60 * 60 * 24 * 5 * 1000; // 5 days

export async function createDevSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, DEV_SESSION_COOKIE_VALUE, {
    maxAge: SESSION_DURATION_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function createSession(idToken: string): Promise<void> {
  if (isDevDataMode()) {
    await createDevSession();
    return;
  }

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION_MS,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    maxAge: SESSION_DURATION_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function getSession(): Promise<{
  uid: string;
  email: string | undefined;
} | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  if (isDevDataMode() && sessionCookie === DEV_SESSION_COOKIE_VALUE) {
    return { uid: "dev-admin", email: "dev@localhost" };
  }

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function requireSession(): Promise<{
  uid: string;
  email: string | undefined;
}> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
