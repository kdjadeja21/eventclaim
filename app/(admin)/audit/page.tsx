import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { AuditLog } from "@/lib/types";
import { AuditTable } from "./audit-table";

async function getAuditLogs(): Promise<AuditLog[]> {
  await requireSession();
  const snap = await adminDb
    .collection("auditLogs")
    .orderBy("timestamp", "desc")
    .limit(200)
    .get();
  return snap.docs.map((d) => d.data() as AuditLog);
}

export default async function AuditPage() {
  const logs = await getAuditLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every important action recorded — last 200 entries
        </p>
      </div>

      <AuditTable logs={logs} />
    </div>
  );
}
