import "server-only";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { auditUserScopeSql } from "@/lib/auth/data-scope";
import { db } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
import { AuditAction, AuditLog } from "@/lib/types";
import { nanoid } from "nanoid";

const EMAILJS_USAGE_ACTIONS = [
  "email_sent",
  "email_resent",
  "email_failed",
] as const satisfies readonly AuditAction[];

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

export async function listAuditLogsForUser(
  sessionUid: string,
  limit: number
): Promise<AuditLog[]> {
  const rows = await db
    .select()
    .from(auditLogs)
    .where(auditUserScopeSql(sessionUid))
    .orderBy(desc(auditLogs.timestamp))
    .limit(limit);
  return rows.map(toAuditLog);
}

/** Counts EmailJS-related audit rows since `monthStart` (for monthly quota). */
export async function countEmailUsageSince(monthStart: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(
      and(
        gte(auditLogs.timestamp, monthStart),
        inArray(auditLogs.action, [...EMAILJS_USAGE_ACTIONS])
      )
    );
  return row?.count ?? 0;
}
