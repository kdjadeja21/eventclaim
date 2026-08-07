import { requireSession } from "@/lib/session";
import { listAuditLogs } from "@/lib/db/repos/audit";
import { AuditLog } from "@/lib/types";
import { AuditTable } from "./audit-table";

async function getAuditLogs(): Promise<AuditLog[]> {
  await requireSession();
  return listAuditLogs(200);
}

export default async function AuditPage() {
  const logs = await getAuditLogs();

  return (
    <div data-demo-focus="audit-log" className="space-y-6">
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
