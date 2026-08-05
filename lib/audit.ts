import { writeAuditLog as writeAuditLogRepo } from "@/lib/db/repos/audit";
import { AuditAction } from "@/lib/types";

export async function writeAuditLog(params: {
  eventId: string | null;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  userId?: string;
}): Promise<void> {
  await writeAuditLogRepo(params);
}
