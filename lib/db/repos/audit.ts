import "server-only";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
import { AuditAction, AuditLog } from "@/lib/types";
import { nanoid } from "nanoid";

function toAuditLog(row: typeof auditLogs.$inferSelect): AuditLog {
  return {
    id: row.id,
    eventId: row.eventId,
    action: row.action as AuditAction,
    metadata: row.metadata as Record<string, unknown>,
    userId: row.userId,
    timestamp: row.timestamp.toISOString(),
  };
}

export async function writeAuditLog(params: {
  eventId: string | null;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  userId?: string;
}): Promise<void> {
  const { eventId, action, metadata = {}, userId = "admin" } = params;
  await db.insert(auditLogs).values({
    id: nanoid(),
    eventId,
    action,
    metadata,
    userId,
  });
}

export async function listAuditLogs(limit: number): Promise<AuditLog[]> {
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.timestamp))
    .limit(limit);
  return rows.map(toAuditLog);
}