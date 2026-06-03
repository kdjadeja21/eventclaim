"use client";

import { useState, useMemo, useTransition, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Send,
  RefreshCw,
  Eye,
  Download,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  CheckCheck,
  Ticket,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Trash2,
} from "lucide-react";
import { Attendee } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, cn } from "@/lib/utils";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  sendSingleEmail,
  resendSingleEmail,
  bulkSendSelected,
} from "./email-actions";
import {
  deleteAttendee,
  getAttendeeDetail,
} from "./attendee-data-actions";

type Filter =
  | "all"
  | "pending"
  | "sent"
  | "failed"
  | "claimed"
  | "unclaimed"
  | "no-coupon";

type SortKey =
  | "name"
  | "emailStatus"
  | "claimed"
  | "emailSentAt"
  | "claimedAt"
  | "createdAt";
type SortDir = "asc" | "desc";

const emailStatusConfig = {
  pending: { label: "Pending", variant: "warning" as const, icon: Clock },
  sent: { label: "Sent", variant: "success" as const, icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive" as const, icon: XCircle },
};

function compareNullableDate(
  a: string | null,
  b: string | null,
  dir: SortDir
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const cmp = a.localeCompare(b);
  return dir === "asc" ? cmp : -cmp;
}

function sortAttendees(
  list: Attendee[],
  sortConfig: { key: SortKey; dir: SortDir } | null
): Attendee[] {
  if (!sortConfig) return list;

  const { key, dir } = sortConfig;
  const sorted = [...list];

  sorted.sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        break;
      case "emailStatus":
        cmp = a.emailStatus.localeCompare(b.emailStatus);
        break;
      case "claimed":
        cmp = Number(a.claimed) - Number(b.claimed);
        break;
      case "emailSentAt":
        return compareNullableDate(a.emailSentAt, b.emailSentAt, dir);
      case "claimedAt":
        return compareNullableDate(a.claimedAt, b.claimedAt, dir);
      case "createdAt":
        return compareNullableDate(a.createdAt, b.createdAt, dir);
    }
    return dir === "asc" ? cmp : -cmp;
  });

  return sorted;
}

export default function AttendeeTable({
  attendees: initial,
  eventId,
  eventSlug,
}: {
  attendees: Attendee[];
  eventId: string;
  eventSlug: string;
}) {
  const [attendees, setAttendees] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    dir: SortDir;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Awaited<
    ReturnType<typeof getAttendeeDetail>
  > | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Attendee | null>(null);
  const [, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setCurrentPage(1);
  }, [filter, search, sortConfig]);

  const filtered = useMemo(() => {
    let list = attendees;

    if (filter === "pending")
      list = list.filter((a) => a.emailStatus === "pending" && a.couponId);
    else if (filter === "sent")
      list = list.filter((a) => a.emailStatus === "sent");
    else if (filter === "failed")
      list = list.filter((a) => a.emailStatus === "failed");
    else if (filter === "claimed") list = list.filter((a) => a.claimed);
    else if (filter === "unclaimed")
      list = list.filter((a) => !a.claimed && a.couponId);
    else if (filter === "no-coupon") list = list.filter((a) => !a.couponId);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          (a.couponId ?? "").toLowerCase().includes(q)
      );
    }

    return sortAttendees(list, sortConfig);
  }, [attendees, filter, search, sortConfig]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const allVisibleSelected =
    paginated.length > 0 && paginated.every((a) => selectedIds.has(a.id));
  const someVisibleSelected =
    paginated.some((a) => selectedIds.has(a.id)) && !allVisibleSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected, selectedIds, paginated]);

  function toggleSort(key: SortKey) {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: "asc" };
    });
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((a) => next.add(a.id));
        return next;
      });
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateAttendee(id: string, patch: Partial<Attendee>) {
    setAttendees((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  }

  function removeAttendee(id: string) {
    setAttendees((prev) => prev.filter((a) => a.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (selectedDetail === id) setSelectedDetail(null);
  }

  async function handleDelete(attendee: Attendee) {
    setActionPending(attendee.id + "-delete");
    startTransition(async () => {
      const res = await deleteAttendee(eventId, attendee.id, eventSlug);
      setActionPending(null);
      if (res.success) {
        removeAttendee(attendee.id);
        toast.success(`${attendee.name} removed.`);
      } else {
        toast.error(res.error ?? "Delete failed.");
      }
      setDeleteTarget(null);
    });
  }

  async function handleSend(attendee: Attendee) {
    setActionPending(attendee.id + "-send");
    startTransition(async () => {
      const res = await sendSingleEmail(eventId, attendee.id);
      if (res.success) {
        updateAttendee(attendee.id, {
          emailStatus: "sent",
          emailSentAt: new Date().toISOString(),
        });
        toast.success(`Email sent to ${attendee.name}`);
      } else {
        updateAttendee(attendee.id, { emailStatus: "failed" });
        toast.error(`Failed to send to ${attendee.name}`);
      }
      setActionPending(null);
    });
  }

  async function handleResend(attendee: Attendee) {
    setActionPending(attendee.id + "-resend");
    startTransition(async () => {
      const res = await resendSingleEmail(eventId, attendee.id);
      if (res.success) {
        updateAttendee(attendee.id, {
          emailStatus: "sent",
          emailSentAt: new Date().toISOString(),
        });
        toast.success(`Email resent to ${attendee.name}`);
      } else {
        updateAttendee(attendee.id, { emailStatus: "failed" });
        toast.error(`Failed to resend to ${attendee.name}`);
      }
      setActionPending(null);
    });
  }

  async function handleBulk(
    mode: "send" | "resend",
    predicate: (a: Attendee) => boolean
  ) {
    const targets = attendees.filter(
      (a) => selectedIds.has(a.id) && predicate(a)
    );
    if (targets.length === 0) {
      toast.error("No eligible attendees in selection");
      return;
    }

    setBulkPending(true);
    const ids = targets.map((a) => a.id);
    const now = new Date().toISOString();

    // Send in chunks so a single server action call never risks a timeout, and
    // the admin sees progress as each chunk completes.
    const CHUNK_SIZE = 25;
    let success = 0;
    let failed = 0;
    let skipped = 0;

    const toastId = toast.loading(`Sending 0 / ${ids.length}…`);

    try {
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunkIds = ids.slice(i, i + CHUNK_SIZE);
        const res = await bulkSendSelected(eventId, chunkIds, mode);

        // Apply the precise per-attendee outcome returned by the server.
        for (const r of res.results) {
          if (r.status === "sent") {
            updateAttendee(r.attendeeId, {
              emailStatus: "sent",
              emailSentAt: now,
            });
          } else if (r.status === "failed") {
            updateAttendee(r.attendeeId, { emailStatus: "failed" });
          }
        }

        success += res.success;
        failed += res.failed;
        skipped += res.skipped;

        toast.loading(
          `Sending ${Math.min(i + CHUNK_SIZE, ids.length)} / ${ids.length}…`,
          { id: toastId }
        );
      }

      const verb = mode === "send" ? "Sent" : "Resent";
      if (failed === 0 && skipped === 0) {
        toast.success(`${verb} ${success} email${success !== 1 ? "s" : ""}`, {
          id: toastId,
        });
      } else if (success === 0 && failed > 0) {
        toast.error(`All ${failed} email${failed !== 1 ? "s" : ""} failed`, {
          id: toastId,
        });
      } else {
        const parts = [`${success} ${verb.toLowerCase()}`];
        if (failed > 0) parts.push(`${failed} failed`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        toast.warning(parts.join(", "), { id: toastId });
      }
    } catch {
      toast.error("Bulk send failed unexpectedly", { id: toastId });
    } finally {
      setBulkPending(false);
    }
  }

  async function openDetail(attendeeId: string) {
    setSelectedDetail(attendeeId);
    setLoadingDetail(true);
    const data = await getAttendeeDetail(eventId, attendeeId);
    setDetailData(data);
    setLoadingDetail(false);
  }

  function exportCsv(rows?: Attendee[]) {
    const data = rows ?? filtered;
    const headers = [
      "Name",
      "Email",
      "Coupon Assigned",
      "Email Status",
      "Claimed",
      "Assigned At",
      "Email Sent At",
      "Claimed At",
    ];
    const csvRows = data.map((a) => [
      a.name,
      a.email,
      a.couponId ? "Yes" : "No",
      a.emailStatus,
      a.claimed ? "Yes" : "No",
      a.couponId ? (a.emailSentAt ?? "") : "",
      a.emailSentAt ?? "",
      a.claimedAt ?? "",
    ]);
    const csv = [headers, ...csvRows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendees-${eventSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts = useMemo(() => {
    return {
      all: attendees.length,
      pending: attendees.filter(
        (a) => a.emailStatus === "pending" && a.couponId
      ).length,
      sent: attendees.filter((a) => a.emailStatus === "sent").length,
      failed: attendees.filter((a) => a.emailStatus === "failed").length,
      claimed: attendees.filter((a) => a.claimed).length,
      unclaimed: attendees.filter((a) => !a.claimed && a.couponId).length,
      "no-coupon": attendees.filter((a) => !a.couponId).length,
    };
  }, [attendees]);

  const selectedAttendees = useMemo(
    () => attendees.filter((a) => selectedIds.has(a.id)),
    [attendees, selectedIds]
  );

  const bulkSendCount = selectedAttendees.filter(
    (a) => a.couponId && a.emailStatus === "pending"
  ).length;
  const bulkResendCount = selectedAttendees.filter(
    (a) => a.emailStatus === "sent"
  ).length;
  const bulkRetryCount = selectedAttendees.filter(
    (a) => a.emailStatus === "failed"
  ).length;

  const hasSelection = selectedIds.size > 0;

  return (
    <div className={cn("space-y-4", hasSelection && "pb-20")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, email, coupon ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({counts.all})</SelectItem>
            <SelectItem value="no-coupon">
              No Coupon ({counts["no-coupon"]})
            </SelectItem>
            <SelectItem value="pending">Pending ({counts.pending})</SelectItem>
            <SelectItem value="sent">Sent ({counts.sent})</SelectItem>
            <SelectItem value="failed">Failed ({counts.failed})</SelectItem>
            <SelectItem value="claimed">Claimed ({counts.claimed})</SelectItem>
            <SelectItem value="unclaimed">
              Unclaimed ({counts.unclaimed})
            </SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => exportCsv()}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected && paginated.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                  aria-label="Select all visible attendees"
                />
              </TableHead>
              <SortableHead
                label="Name / Email"
                sortKey="name"
                sortConfig={sortConfig}
                onSort={toggleSort}
              />
              <TableHead>Coupon</TableHead>
              <SortableHead
                label="Email"
                sortKey="emailStatus"
                sortConfig={sortConfig}
                onSort={toggleSort}
              />
              <SortableHead
                label="Claim"
                sortKey="claimed"
                sortConfig={sortConfig}
                onSort={toggleSort}
              />
              <SortableHead
                label="Email Sent"
                sortKey="emailSentAt"
                sortConfig={sortConfig}
                onSort={toggleSort}
              />
              <SortableHead
                label="Claimed At"
                sortKey="claimedAt"
                sortConfig={sortConfig}
                onSort={toggleSort}
              />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground text-sm"
                >
                  No attendees match this filter.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((attendee) => (
                <TableRow
                  key={attendee.id}
                  data-state={
                    selectedIds.has(attendee.id) ? "selected" : undefined
                  }
                  className={cn(
                    selectedIds.has(attendee.id) && "bg-muted/50"
                  )}
                >
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(attendee.id)}
                      onChange={() => toggleRow(attendee.id)}
                      className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                      aria-label={`Select ${attendee.name}`}
                    />
                  </TableCell>
                  <TableCell className="min-w-40">
                    <div className="font-medium text-sm leading-tight">
                      {attendee.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {attendee.email}
                    </div>
                  </TableCell>

                  <TableCell>
                    {attendee.couponId ? (
                      <Badge variant="success" className="gap-1">
                        <Ticket className="h-3 w-3" />
                        Assigned
                      </Badge>
                    ) : (
                      <Badge variant="warning">Waiting</Badge>
                    )}
                  </TableCell>

                  <TableCell>
                    {(() => {
                      const cfg = emailStatusConfig[attendee.emailStatus];
                      const Icon = cfg.icon;
                      return (
                        <Badge variant={cfg.variant} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                      );
                    })()}
                  </TableCell>

                  <TableCell>
                    {attendee.claimed ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCheck className="h-3 w-3" />
                        Claimed
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Unclaimed</Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(attendee.emailSentAt)}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(attendee.claimedAt)}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      {attendee.couponId &&
                        attendee.emailStatus === "pending" && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleSend(attendee)}
                            disabled={
                              actionPending === attendee.id + "-send"
                            }
                          >
                            {actionPending === attendee.id + "-send" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Send
                          </Button>
                        )}

                      {attendee.emailStatus === "sent" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResend(attendee)}
                          disabled={
                            actionPending === attendee.id + "-resend"
                          }
                        >
                          {actionPending === attendee.id + "-resend" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Resend
                        </Button>
                      )}

                      {attendee.emailStatus === "failed" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleResend(attendee)}
                          disabled={
                            actionPending === attendee.id + "-resend"
                          }
                        >
                          {actionPending === attendee.id + "-resend" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Retry
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDetail(attendee.id)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>

                      {!attendee.couponId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(attendee)}
                          disabled={actionPending === attendee.id + "-delete"}
                          className="text-destructive hover:text-destructive"
                          title="Delete attendee"
                        >
                          {actionPending === attendee.id + "-delete" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {hasSelection && (
        <div
          role="toolbar"
          aria-label="Bulk attendee actions"
          className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:left-60"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-6 py-3">
            <span className="text-sm font-medium mr-2 shrink-0">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              disabled={bulkPending || bulkSendCount === 0}
              onClick={() =>
                handleBulk(
                  "send",
                  (a) => !!a.couponId && a.emailStatus === "pending"
                )
              }
            >
              {bulkPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send Email
              {bulkSendCount > 0 && ` (${bulkSendCount})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkPending || bulkResendCount === 0}
              onClick={() =>
                handleBulk("resend", (a) => a.emailStatus === "sent")
              }
            >
              {bulkPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Resend
              {bulkResendCount > 0 && ` (${bulkResendCount})`}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkPending || bulkRetryCount === 0}
              onClick={() =>
                handleBulk("resend", (a) => a.emailStatus === "failed")
              }
            >
              {bulkPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Retry Failed
              {bulkRetryCount > 0 && ` (${bulkRetryCount})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkPending}
              onClick={() => exportCsv(selectedAttendees)}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkPending}
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3.5 w-3.5" />
              Deselect
            </Button>
          </div>
        </div>
      )}

      <TablePagination
        total={filtered.length}
        page={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemLabel="attendees"
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete Attendee?
            </DialogTitle>
            <DialogDescription>
              This will permanently remove the attendee record. Only attendees
              without an assigned coupon can be deleted.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Name:</span>{" "}
                <span className="font-medium">{deleteTarget.name}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span>{" "}
                <span className="font-medium">{deleteTarget.email}</span>
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={
                actionPending === (deleteTarget?.id ?? "") + "-delete"
              }
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              {actionPending === (deleteTarget?.id ?? "") + "-delete" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedDetail !== null}
        onOpenChange={(open) => !open && setSelectedDetail(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Attendee Detail</DialogTitle>
            <DialogDescription>
              Full info, coupon, and email history
            </DialogDescription>
          </DialogHeader>
          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailData ? (
            <div className="space-y-4 text-sm">
              <DetailSection title="Attendee">
                <DetailRow label="Name" value={detailData.attendee.name} />
                <DetailRow label="Email" value={detailData.attendee.email} />
                <DetailRow
                  label="Created At"
                  value={formatDateTime(detailData.attendee.createdAt)}
                />
              </DetailSection>

              <DetailSection title="Coupon">
                <DetailRow
                  label="Assigned"
                  value={detailData.attendee.couponId ? "Yes" : "No"}
                />
                <DetailRow
                  label="Coupon ID"
                  value={detailData.attendee.couponId ?? "—"}
                />
                <DetailRow
                  label="Claimed"
                  value={detailData.attendee.claimed ? "Yes" : "No"}
                />
                <DetailRow
                  label="Claimed At"
                  value={formatDateTime(detailData.attendee.claimedAt)}
                />
              </DetailSection>

              {detailData.emailLogs.length > 0 && (
                <DetailSection title="Email History">
                  {detailData.emailLogs.map((log) => (
                    <DetailRow
                      key={log.id}
                      label={log.emailType === "resend" ? "Resend" : "Initial"}
                      value={`${formatDateTime(log.sentAt)} · ${log.status}`}
                    />
                  ))}
                </DetailSection>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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
        className="inline-flex items-center gap-1 font-medium hover:text-foreground text-muted-foreground transition-colors"
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0" />
      </button>
    </TableHead>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="rounded-md border divide-y">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-48 truncate">{value}</span>
    </div>
  );
}
