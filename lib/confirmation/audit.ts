import { adminDb } from "@/lib/firebase/admin";
import { nanoid } from "nanoid";
import { ConfirmationAuditAction, ConfirmationAuditLog } from "@/lib/confirmation/types";

export async function writeConfirmationAuditLog(params: {
  action: ConfirmationAuditAction;
  actorType: "admin" | "volunteer";
  actorId: string;
  actorName?: string;
  attendeeId?: string;
  attendeeName?: string;
  volunteerId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const {
    action,
    actorType,
    actorId,
    actorName,
    attendeeId,
    attendeeName,
    volunteerId,
    metadata = {},
  } = params;

  const log: ConfirmationAuditLog = {
    id: nanoid(),
    action,
    actorType,
    actorId,
    ...(actorName ? { actorName } : {}),
    ...(attendeeId ? { attendeeId } : {}),
    ...(attendeeName ? { attendeeName } : {}),
    ...(volunteerId ? { volunteerId } : {}),
    metadata,
    timestamp: new Date().toISOString(),
  };

  await adminDb.collection("confirmationAuditLogs").doc(log.id).set(log);
}
