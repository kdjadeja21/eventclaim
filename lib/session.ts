import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/admin";
import { isAccessAdminEmail } from "@/lib/access";
import { isEmailApproved } from "@/lib/db/repos/portal-users";

const SESSION_COOKIE_NAME = "eventclaim_session";
const SESSION_DURATION_MS = 60 * 60 * 24 * 5 * 1000; // 5 days

export async function createSession(idToken: string): Promise<void> {
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

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const email = decoded.email;

    // Defense in depth: cookie alone is not enough — must be approved in
    // portal_users (or be the hard-coded access admin).
    const approved = await isEmailApproved(email);
    if (!approved) {
      cookieStore.delete(SESSION_COOKIE_NAME);
      return null;
    }

    return { uid: decoded.uid, email };
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

/** Session + sole access-management admin gate. */
export async function requireAccessAdmin(): Promise<{
  uid: string;
  email: string;
}> {
  const session = await requireSession();
  if (!isAccessAdminEmail(session.email)) {
    throw new Error("FORBIDDEN");
  }
  return { uid: session.uid, email: session.email!.trim().toLowerCase() };
}
