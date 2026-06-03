"use client";

import { useState, useMemo, useTransition } from "react";
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
import { formatDateTime } from "@/lib/utils";
import { sendSingleEmail, resendSingleEmail } from "./email-actions";
import { getAttendeeDetail } from "./attendee-data-actions";

type Filter =
  | "all"
  | "pending"
  | "sent"
  | "failed"
  | "claimed"
  | "unclaimed"
  | "no-coupon";

const emailStatusConfig = {
  pending: { label: "Pending", variant: "warning" as const, icon: Clock },
  sent: { label: "Sent", variant: "success" as const, icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive" as const, icon: XCircle },
};

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
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<Awaited<ReturnType<typeof getAttendeeDetail>> | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Filter + search
  const filtered = useMemo(() => {
    let list = attendees;

    if (filter === "pending") list = list.filter((a) => a.emailStatus === "pending" && a.couponId);
    else if (filter === "sent") list = list.filter((a) => a.emailStatus === "sent");
    else if (filter === "failed") list = list.filter((a) => a.emailStatus === "failed");
    else if (filter === "claimed") list = list.filter((a) => a.claimed);
    else if (filter === "unclaimed") list = list.filter((a) => !a.claimed && a.couponId);
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

    return list;
  }, [attendees, filter, search]);

  function updateAttendee(id: string, patch: Partial<Attendee>) {
    setAttendees((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
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

  async function openDetail(attendeeId: string) {
    setSelectedDetail(attendeeId);
    setLoadingDetail(true);
    const data = await getAttendeeDetail(eventId, attendeeId);
    setDetailData(data);
    setLoadingDetail(false);
  }

  function exportCsv() {
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
    const rows = filtered.map((a) => [
      a.name,
      a.email,
      a.couponId ? "Yes" : "No",
      a.emailStatus,
      a.claimed ? "Yes" : "No",
      a.couponId ? (a.emailSentAt ?? "") : "",
      a.emailSentAt ?? "",
      a.claimedAt ?? "",
    ]);
    const csv = [headers, ...rows]
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
      pending: attendees.filter((a) => a.emailStatus === "pending" && a.couponId).length,
      sent: attendees.filter((a) => a.emailStatus === "sent").length,
      failed: attendees.filter((a) => a.emailStatus === "failed").length,
      claimed: attendees.filter((a) => a.claimed).length,
      unclaimed: attendees.filter((a) => !a.claimed && a.couponId).length,
      "no-coupon": attendees.filter((a) => !a.couponId).length,
    };
  }, [attendees]);

  return (
    <div className="space-y-4">
      {/* Controls */}
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
            <SelectItem value="no-coupon">No Coupon ({counts["no-coupon"]})</SelectItem>
            <SelectItem value="pending">Pending ({counts.pending})</SelectItem>
            <SelectItem value="sent">Sent ({counts.sent})</SelectItem>
            <SelectItem value="failed">Failed ({counts.failed})</SelectItem>
            <SelectItem value="claimed">Claimed ({counts.claimed})</SelectItem>
            <SelectItem value="unclaimed">Unclaimed ({counts.unclaimed})</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name / Email</TableHead>
              <TableHead>Coupon</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Claim</TableHead>
              <TableHead>Email Sent</TableHead>
              <TableHead>Claimed At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-12 text-muted-foreground text-sm"
                >
                  No attendees match this filter.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((attendee) => (
                <TableRow key={attendee.id}>
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
                      {attendee.couponId && attendee.emailStatus === "pending" && (
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
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Showing {filtered.length} of {attendees.length} attendees
      </p>

      {/* Detail Dialog */}
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
