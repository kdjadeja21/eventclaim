"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { AuditAction, AuditLog } from "@/lib/types";
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

type EventFilter = "all" | "event" | "system";
type SortKey = "action" | "message" | "timestamp" | "eventId" | "details";
type SortDir = "asc" | "desc";

const actionVariant: Record<
  AuditAction,
  "default" | "success" | "info" | "warning" | "destructive" | "secondary"
> = {
  event_created: "default",
  event_updated: "info",
  event_deleted: "destructive",
  attendee_imported: "info",
  attendee_deleted: "destructive",
  coupon_imported: "info",
  coupon_assigned: "success",
  coupon_unassigned: "warning",
  coupon_added: "success",
  email_sent: "success",
  email_resent: "warning",
  email_failed: "destructive",
  coupon_claimed: "success",
  status_checked: "secondary",
};

const actionLabels: Record<AuditAction, string> = {
  event_created: "Event Created",
  event_updated: "Event Updated",
  event_deleted: "Event Deleted",
  attendee_imported: "Attendees Imported",
  attendee_deleted: "Attendee Deleted",
  coupon_imported: "Coupons Imported",
  coupon_assigned: "Coupon Assigned",
  coupon_unassigned: "Coupon Unassigned",
  coupon_added: "Coupon Added",
  email_sent: "Email Sent",
  email_resent: "Email Resent",
  email_failed: "Email Failed",
  coupon_claimed: "Coupon Claimed",
  status_checked: "Status Checked",
};

function stringifyMetadata(metadata: AuditLog["metadata"]): string {
  return JSON.stringify(metadata);
}

function getMetadataString(
  metadata: AuditLog["metadata"],
  key: string
): string | null {
  const value = metadata[key];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function getMetadataNumber(
  metadata: AuditLog["metadata"],
  key: string
): number | null {
  const value = metadata[key];
  return typeof value === "number" ? value : null;
}

function formatImportMessage(
  verb: string,
  item: string,
  metadata: AuditLog["metadata"]
): string {
  const imported = getMetadataNumber(metadata, "imported");
  const skipped =
    getMetadataNumber(metadata, "skipped") ??
    getMetadataNumber(metadata, "duplicatesSkipped");
  const invalid = getMetadataNumber(metadata, "invalid");
  const parts = [
    imported !== null ? `${verb} ${imported} ${item}` : `${verb} ${item}`,
    skipped ? `skipped ${skipped} duplicates` : null,
    invalid ? `ignored ${invalid} invalid rows` : null,
  ].filter(Boolean);

  return `${parts.join(", ")}.`;
}

function getAuditMessage(log: AuditLog): string {
  const { metadata } = log;
  const email = getMetadataString(metadata, "email");
  const attendeeId = getMetadataString(metadata, "attendeeId");
  const couponId = getMetadataString(metadata, "couponId");
  const eventName = getMetadataString(metadata, "name");
  const slug = getMetadataString(metadata, "slug");
  const deletedEventId = getMetadataString(metadata, "deletedEventId");

  switch (log.action) {
    case "event_created":
      return `Event ${eventName ? `"${eventName}" ` : ""}was created${
        slug ? ` with slug "${slug}"` : ""
      }.`;
    case "event_updated": {
      const status = getMetadataString(metadata, "status");
      if (status) return `Event status was changed to "${status}".`;
      if (getMetadataString(metadata, "notionGuideUrl")) {
        return "Event guide link was updated.";
      }
      return "Event details were updated.";
    }
    case "event_deleted":
      return `Event ${eventName ? `"${eventName}" ` : ""}was deleted${
        slug ? ` (slug: ${slug})` : deletedEventId ? ` (${deletedEventId})` : ""
      }.`;
    case "attendee_imported":
      return formatImportMessage("Imported", "attendees", metadata);
    case "attendee_deleted":
      return `Attendee ${eventName ? `"${eventName}" ` : ""}${
        email ? `<${email}> ` : attendeeId ? `${attendeeId} ` : ""
      }was deleted.`;
    case "coupon_imported":
      return formatImportMessage("Imported", "coupons", metadata);
    case "coupon_added":
      return formatImportMessage("Added", "coupons", metadata);
    case "coupon_assigned":
      return `Coupon ${couponId ?? "record"} was assigned${
        attendeeId ? ` to attendee ${attendeeId}` : ""
      }.`;
    case "coupon_unassigned":
      return `Coupon ${couponId ?? "record"} was unassigned${
        attendeeId ? ` from attendee ${attendeeId}` : ""
      }.`;
    case "email_sent":
      return `Coupon email was sent${email ? ` to ${email}` : ""}.`;
    case "email_resent":
      return `Coupon email was resent${email ? ` to ${email}` : ""}.`;
    case "email_failed": {
      const error = getMetadataString(metadata, "error");
      return `Coupon email failed${email ? ` for ${email}` : ""}${
        error ? `: ${error}` : ""
      }.`;
    }
    case "coupon_claimed":
      return `Coupon ${couponId ?? "record"} was claimed${
        email ? ` by ${email}` : attendeeId ? ` by attendee ${attendeeId}` : ""
      }.`;
    case "status_checked":
      return `Claim status was checked${email ? ` for ${email}` : ""}.`;
  }
}

function compareNullableString(
  a: string | null,
  b: string | null,
  dir: SortDir
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const cmp = a.localeCompare(b, undefined, { sensitivity: "base" });
  return dir === "asc" ? cmp : -cmp;
}

function sortLogs(
  list: AuditLog[],
  sortConfig: { key: SortKey; dir: SortDir } | null
): AuditLog[] {
  if (!sortConfig) return list;

  const { key, dir } = sortConfig;
  const sorted = [...list];

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "action":
        cmp = actionLabels[a.action].localeCompare(actionLabels[b.action], undefined, {
          sensitivity: "base",
        });
        break;
      case "message":
        cmp = getAuditMessage(a).localeCompare(getAuditMessage(b), undefined, {
          sensitivity: "base",
        });
        break;
      case "timestamp":
        cmp = a.timestamp.localeCompare(b.timestamp);
        break;
      case "eventId":
        return compareNullableString(a.eventId, b.eventId, dir);
      case "details":
        cmp = stringifyMetadata(a.metadata).localeCompare(
          stringifyMetadata(b.metadata),
          undefined,
          { sensitivity: "base" }
        );
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  return sorted;
}

export function AuditTable({ logs }: { logs: AuditLog[] }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<"all" | AuditAction>("all");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    dir: SortDir;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setCurrentPage(1);
  }, [logs, search, actionFilter, eventFilter, sortConfig]);

  const actionCounts = useMemo(() => {
    return logs.reduce(
      (counts, log) => {
        counts[log.action] = (counts[log.action] ?? 0) + 1;
        return counts;
      },
      {} as Partial<Record<AuditAction, number>>
    );
  }, [logs]);

  const visibleActions = useMemo(
    () =>
      (Object.keys(actionCounts) as AuditAction[]).sort((a, b) =>
        actionLabels[a].localeCompare(actionLabels[b], undefined, {
          sensitivity: "base",
        })
      ),
    [actionCounts]
  );

  const eventCounts = useMemo(
    () => ({
      all: logs.length,
      event: logs.filter((log) => log.eventId).length,
      system: logs.filter((log) => !log.eventId).length,
    }),
    [logs]
  );

  const filtered = useMemo(() => {
    let list = logs;

    if (actionFilter !== "all") {
      list = list.filter((log) => log.action === actionFilter);
    }

    if (eventFilter === "event") {
      list = list.filter((log) => log.eventId);
    } else if (eventFilter === "system") {
      list = list.filter((log) => !log.eventId);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((log) => {
        const details = stringifyMetadata(log.metadata).toLowerCase();
        const message = getAuditMessage(log).toLowerCase();
        return (
          actionLabels[log.action].toLowerCase().includes(q) ||
          message.includes(q) ||
          log.action.toLowerCase().includes(q) ||
          (log.eventId ?? "").toLowerCase().includes(q) ||
          details.includes(q)
        );
      });
    }

    return sortLogs(list, sortConfig);
  }, [logs, actionFilter, eventFilter, search, sortConfig]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  function toggleSort(key: SortKey) {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: key === "timestamp" ? "desc" : "asc" };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search action, event ID, details..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={actionFilter}
          onValueChange={(value) =>
            setActionFilter(value as "all" | AuditAction)
          }
        >
          <SelectTrigger className="w-52">
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
        <Select
          value={eventFilter}
          onValueChange={(value) => setEventFilter(value as EventFilter)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes ({eventCounts.all})</SelectItem>
            <SelectItem value="event">Event logs ({eventCounts.event})</SelectItem>
            <SelectItem value="system">
              System logs ({eventCounts.system})
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Action"
                  sortKey="action"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Message"
                  sortKey="message"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Timestamp"
                  sortKey="timestamp"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Event ID"
                  sortKey="eventId"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
                <SortableHead
                  label="Details"
                  sortKey="details"
                  sortConfig={sortConfig}
                  onSort={toggleSort}
                />
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
                      ? "No audit logs yet."
                      : "No audit logs match this filter."}
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
                    <TableCell className="text-sm text-foreground min-w-64">
                      {getAuditMessage(log)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(log.timestamp)}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {log.eventId ?? "—"}
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
        page={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemLabel="entries"
      />
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  sortConfig,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sortConfig: { key: SortKey; dir: SortDir } | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sortConfig?.key === sortKey;
  const Icon = active
    ? sortConfig!.dir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </TableHead>
  );
}
