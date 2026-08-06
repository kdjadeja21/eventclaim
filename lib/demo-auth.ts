/**
 * TEMP DEMO AUTH — delete this file to remove demo login (see DEMO_AUTH_REMOVE.md)
 *
 * Mint/verify a signed demo session cookie so local recording can skip Google.
 * Disabled unless DEMO_AUTH_ENABLED=true and never allowed on Vercel production.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE_NAME = "eventclaim_session";
const SESSION_DURATION_MS = 60 * 60 * 24 * 5 * 1000; // 5 days
const DEMO_PREFIX = "demo.";
const DEMO_UID = "demo-user";
const DEMO_EMAIL = "demo@eventclaim.local";

type DemoPayload = {
  uid: string;
  email: string;
  exp: number;
};

export function isDemoAuthAllowed(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.DEMO_AUTH_ENABLED !== "true") return false;
  if (!process.env.DEMO_AUTH_SECRET) return false;
  return true;
}

function getSecret(): string {
  const secret = process.env.DEMO_AUTH_SECRET;
  if (!secret) {
    throw new Error("DEMO_AUTH_SECRET is not set");
  }
  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function createDemoSessionCookieValue(): string {
  const payload: DemoPayload = {
    uid: DEMO_UID,
    email: DEMO_EMAIL,
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  return `${DEMO_PREFIX}${payloadB64}.${sign(payloadB64)}`;
}

export async function createDemoSession(): Promise<void> {
  if (!isDemoAuthAllowed()) {
    throw new Error("Demo auth is disabled");
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, createDemoSessionCookieValue(), {
    maxAge: SESSION_DURATION_MS / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export function verifyDemoSessionCookie(
  sessionCookie: string
): { uid: string; email: string } | null {
  if (!isDemoAuthAllowed()) return null;
  if (!sessionCookie.startsWith(DEMO_PREFIX)) return null;

  const rest = sessionCookie.slice(DEMO_PREFIX.length);
  const dot = rest.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = rest.slice(0, dot);
  const signature = rest.slice(dot + 1);
  if (!safeEqual(signature, sign(payloadB64))) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as DemoPayload;
    if (!payload?.uid || !payload?.email || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return { uid: payload.uid, email: payload.email };
  } catch {
    return null;
  }
}
