import { isDevDataMode } from "@/lib/dev-mode";
import { adminDb } from "@/lib/firebase/admin";
import { AuditAction, AuditLog } from "@/lib/types";
import { nanoid } from "nanoid";

export async function writeAuditLog(params: {
  eventId: string | null;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  userId?: string;
}): Promise<void> {
  const { eventId, action, metadata = {}, userId = "admin" } = params;
  const log: AuditLog = {
    id: nanoid(),
    eventId,
    action,
    metadata,
    userId,
    timestamp: new Date().toISOString(),
  };

  if (isDevDataMode()) {
    console.info("[dev-audit]", log.action, log.eventId, log.metadata);
    return;
  }

  await adminDb.collection("auditLogs").doc(log.id).set(log);
}
