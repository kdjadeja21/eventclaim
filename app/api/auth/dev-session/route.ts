import { NextResponse } from "next/server";
import { isDevDataMode } from "@/lib/dev-mode";
import { createDevSession } from "@/lib/session";

export async function POST() {
  if (!isDevDataMode()) {
    return NextResponse.json({ error: "Dev data mode is not enabled" }, { status: 403 });
  }

  try {
    await createDevSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Dev session creation error:", err);
    return NextResponse.json({ error: "Failed to create dev session" }, { status: 500 });
  }
}
