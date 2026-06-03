import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { AuditLog } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const actionVariant: Record<
  string,
  "default" | "success" | "info" | "warning" | "destructive" | "secondary"
> = {
  event_created: "default",
  event_updated: "info",
  attendee_imported: "info",
  coupon_imported: "info",
  coupon_assigned: "success",
  email_sent: "success",
  email_resent: "warning",
  email_failed: "destructive",
  coupon_claimed: "success",
  status_checked: "secondary",
};

const actionLabels: Record<string, string> = {
  event_created: "Event Created",
  event_updated: "Event Updated",
  attendee_imported: "Attendees Imported",
  coupon_imported: "Coupons Imported",
  coupon_assigned: "Coupon Assigned",
  email_sent: "Email Sent",
  email_resent: "Email Resent",
  email_failed: "Email Failed",
  coupon_claimed: "Coupon Claimed",
  status_checked: "Status Checked",
};

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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Event ID</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    No audit logs yet.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge
                        variant={actionVariant[log.action] ?? "secondary"}
                        className="whitespace-nowrap"
                      >
                        {actionLabels[log.action] ?? log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {log.eventId ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {JSON.stringify(log.metadata)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
