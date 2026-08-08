import { NextResponse } from "next/server";
import { createLoadTestSession } from "@/lib/session";
import { isLoadTestEnabled } from "@/lib/load-test-config";

export async function POST() {
  if (!isLoadTestEnabled()) {
    return NextResponse.json(
      { error: "Load test auth is disabled." },
      { status: 403 }
    );
  }

  try {
    await createLoadTestSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Load test session creation error:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
