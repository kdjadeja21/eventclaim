import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "eventclaim_session";

const PROTECTED_PREFIXES = ["/dashboard", "/events", "/audit", "/confirmations"];
const PUBLIC_PATHS = ["/login", "/check-status", "/claim", "/volunteer"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow API routes (they do their own auth check)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Redirect root to dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) {
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  // Cookie presence is checked here; full JWT verification happens in server
  // actions / route handlers via requireSession() (avoids Edge runtime issues
  // with firebase-admin).
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
