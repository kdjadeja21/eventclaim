"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ConfirmationAuditAction, ConfirmationAuditLog } from "@/lib/confirmation/types";
import { getConfirmationLogMessage } from "@/lib/confirmation/log-message";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const actionVariant: Record<
  ConfirmationAuditAction,
  "default" | "success" | "info" | "warning" | "destructive" | "secondary"
> = {
  attendees_imported: "info",
  volunteer_created: "success",
  volunteer_deactivated: "warning",
  volunteer_pin_reset: "secondary",
  attendees_assigned: "info",
  attendee_status_updated: "success",
};

const actionLabels: Record<ConfirmationAuditAction, string> = {
  attendees_imported: "Attendees Imported",
  volunteer_created: "Volunteer Created",
  volunteer_deactivated: "Volunteer Status Changed",
  volunteer_pin_reset: "Volunteer PIN Reset",
  attendees_assigned: "Attendees Assigned",
  attendee_status_updated: "Attendee Status Updated",
};

function stringifyMetadata(metadata: ConfirmationAuditLog["metadata"]): string {
  return JSON.stringify(metadata);
}

export function LogTable({ logs }: { logs: ConfirmationAuditLog[] }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | ConfirmationAuditAction>(
    "all"
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const actionCounts = useMemo(() => {
    return logs.reduce(
      (counts, log) => {
        counts[log.action] = (counts[log.action] ?? 0) + 1;
        return counts;
      },
      {} as Partial<Record<ConfirmationAuditAction, number>>
    );
  }, [logs]);

  const visibleActions = useMemo(
    () =>
      (Object.keys(actionCounts) as ConfirmationAuditAction[]).sort((a, b) =>
        actionLabels[a].localeCompare(actionLabels[b])
      ),
    [actionCounts]
  );

  const filtered = useMemo(() => {
    let list = logs;

    if (actionFilter !== "all") {
      list = list.filter((log) => log.action === actionFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((log) => {
        const details = stringifyMetadata(log.metadata).toLowerCase();
        const label = actionLabels[log.action].toLowerCase();
        const message = getConfirmationLogMessage(log).toLowerCase();
        return (
          label.includes(q) ||
          message.includes(q) ||
          log.actorType.toLowerCase().includes(q) ||
          log.actorId.toLowerCase().includes(q) ||
          (log.actorName ?? "").toLowerCase().includes(q) ||
          (log.attendeeId ?? "").toLowerCase().includes(q) ||
          (log.attendeeName ?? "").toLowerCase().includes(q) ||
          (log.volunteerId ?? "").toLowerCase().includes(q) ||
          details.includes(q)
        );
      });
    }

    return list;
  }, [logs, actionFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, effectivePage, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search action, actor, details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={actionFilter}
          onValueChange={(v) => setActionFilter(v as "all" | ConfirmationAuditAction)}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions ({logs.length})</SelectItem>
            {visibleActions.map((action) => (
              <SelectItem key={action} value={action}>
                {actionLabels[action]} ({actionCounts[action] ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    {logs.length === 0
                      ? "No confirmation logs yet."
                      : "No logs match this filter."}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={actionVariant[log.action]} className="whitespace-nowrap">
                        {actionLabels[log.action]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-foreground min-w-64">
                      {getConfirmationLogMessage(log)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      <Badge
                        variant={log.actorType === "volunteer" ? "info" : "outline"}
                        className="mr-1 capitalize"
                      >
                        {log.actorType}
                      </Badge>
                      <span className="text-muted-foreground">
                        {log.actorName ?? log.actorId}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {stringifyMetadata(log.metadata)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TablePagination
        total={filtered.length}
        page={effectivePage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemLabel="entries"
      />
    </div>
  );
}
