import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { getFriendlyFirestoreMessage } from "@/lib/firestore-errors";
import { AuditLog } from "@/lib/types";

export interface AuditData {
  logs: AuditLog[];
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const snap = await adminDb
      .collection("auditLogs")
      .orderBy("timestamp", "desc")
      .limit(200)
      .get();
    const logs = snap.docs.map((d) => d.data() as AuditLog);
    return NextResponse.json({ logs } satisfies AuditData);
  } catch (error) {
    console.error("[api/audit] Failed to load audit logs:", error);
    return NextResponse.json(
      { error: "UNAVAILABLE", message: getFriendlyFirestoreMessage(error) },
      { status: 503 }
    );
  }
}
