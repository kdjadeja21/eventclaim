"use client";

import { useState, useMemo, useEffect } from "react";
import { AuditLog } from "@/lib/types";
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
import { TablePagination } from "@/components/ui/table-pagination";
import { Card, CardContent } from "@/components/ui/card";

const actionVariant: Record<
  string,
  "default" | "success" | "info" | "warning" | "destructive" | "secondary"
> = {
  event_created: "default",
  event_updated: "info",
  attendee_imported: "info",
  attendee_deleted: "destructive",
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
  attendee_deleted: "Attendee Deleted",
  coupon_imported: "Coupons Imported",
  coupon_assigned: "Coupon Assigned",
  email_sent: "Email Sent",
  email_resent: "Email Resent",
  email_failed: "Email Failed",
  coupon_claimed: "Coupon Claimed",
  status_checked: "Status Checked",
};

export function AuditTable({ logs }: { logs: AuditLog[] }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setCurrentPage(1);
  }, [logs]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return logs.slice(start, start + pageSize);
  }, [logs, currentPage, pageSize]);

  return (
    <div className="space-y-3">
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
                paginated.map((log) => (
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

      <TablePagination
        total={logs.length}
        page={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemLabel="entries"
      />
    </div>
  );
}
