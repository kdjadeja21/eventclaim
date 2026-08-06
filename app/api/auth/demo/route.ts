import { NextResponse } from "next/server";
import { createDemoSession, isDemoAuthAllowed } from "@/lib/demo-auth";

/** TEMP DEMO AUTH — delete this folder with demo login (see DEMO_AUTH_REMOVE.md) */
export async function POST() {
  if (!isDemoAuthAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await createDemoSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Demo session creation error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
