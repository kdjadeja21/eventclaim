import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { ConfirmationAuditLog } from "@/lib/confirmation/types";
import { LogTable } from "./log-table";

async function getConfirmationLogs(): Promise<ConfirmationAuditLog[]> {
  await requireSession();
  const snap = await adminDb
    .collection("confirmationAuditLogs")
    .orderBy("timestamp", "desc")
    .limit(200)
    .get();
  return snap.docs.map((d) => d.data() as ConfirmationAuditLog);
}

export default async function ConfirmationLogsPage() {
  const logs = await getConfirmationLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Confirmation Logs
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every import, assignment, and status change — last 200 entries
        </p>
      </div>

      <LogTable logs={logs} />
    </div>
  );
}
