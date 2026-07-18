import { cookies } from "next/headers";
import crypto from "crypto";

// Separate from lib/session.ts since volunteers aren't Firebase Auth users —
// this is a lightweight self-signed cookie, not a Firebase session cookie.

const SESSION_COOKIE_NAME = "confirm_volunteer_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.CONFIRMATION_SESSION_SECRET;
  if (!secret) {
    console.warn(
      "[volunteer-session] CONFIRMATION_SESSION_SECRET is not set. " +
        "Using an insecure development fallback — set this in production."
    );
    return "insecure-dev-secret-set-CONFIRMATION_SESSION_SECRET";
  }
  return secret;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

function buildCookieValue(volunteerId: string, expiresAtMs: number): string {
  const payload = `${volunteerId}.${expiresAtMs}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

function parseCookieValue(
  value: string
): { volunteerId: string; expiresAtMs: number } | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [volunteerId, expiresAtMsStr, signature] = parts;
  const expiresAtMs = Number(expiresAtMsStr);
  if (!volunteerId || !Number.isFinite(expiresAtMs)) return null;

  const expectedSignature = sign(`${volunteerId}.${expiresAtMsStr}`);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (
    sigBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  if (Date.now() > expiresAtMs) return null;

  return { volunteerId, expiresAtMs };
}

export async function createVolunteerSession(volunteerId: string): Promise<void> {
  const expiresAtMs = Date.now() + SESSION_DURATION_MS;
  const cookieValue = buildCookieValue(volunteerId, expiresAtMs);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, cookieValue, {
    maxAge: SESSION_DURATION_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/volunteer",
  });
}

export async function getVolunteerSession(): Promise<{
  volunteerId: string;
} | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!cookieValue) return null;

  const parsed = parseCookieValue(cookieValue);
  if (!parsed) return null;

  return { volunteerId: parsed.volunteerId };
}

export async function clearVolunteerSession(): Promise<void> {
  const cookieStore = await cookies();
  // Must match the path used in createVolunteerSession — a bare delete()
  // only clears cookies set on path "/" and leaves the volunteer session
  // cookie in place, which made Sign Out appear to do nothing.
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/volunteer",
  });
}
