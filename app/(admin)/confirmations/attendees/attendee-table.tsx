"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Eye } from "lucide-react";
import {
  ConfirmationAttendee,
  ConfirmationStatus,
  ConfirmationVolunteer,
  CONFIRMATION_STATUSES,
  CONFIRMATION_STATUS_LABELS,
} from "@/lib/confirmation/types";
import { reassignAttendeeAdmin, updateAttendeeStatusAdmin } from "./attendee-actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils";

const statusVariant: Record<
  ConfirmationStatus,
  "default" | "success" | "info" | "warning" | "destructive" | "secondary"
> = {
  need_confirmation: "secondary",
  call_pending: "info",
  call_done: "warning",
  confirm_coming: "success",
  not_coming: "destructive",
};

export function AttendeeTable({
  attendees,
  volunteers,
}: {
  attendees: ConfirmationAttendee[];
  volunteers: ConfirmationVolunteer[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ConfirmationStatus>("all");
  const [volunteerFilter, setVolunteerFilter] = useState<"all" | "unassigned" | string>(
    "all"
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<ConfirmationAttendee | null>(null);

  const filtered = useMemo(() => {
    let list = attendees;

    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }

    if (volunteerFilter === "unassigned") {
      list = list.filter((a) => !a.assignedVolunteerId);
    } else if (volunteerFilter !== "all") {
      list = list.filter((a) => a.assignedVolunteerId === volunteerFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          (a.phone ?? "").toLowerCase().includes(q) ||
          (a.assignedVolunteerName ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [attendees, statusFilter, volunteerFilter, search]);

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
            placeholder="Search name, email, phone, volunteer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | ConfirmationStatus)}
        >
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses ({attendees.length})</SelectItem>
            {CONFIRMATION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {CONFIRMATION_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={volunteerFilter} onValueChange={setVolunteerFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All volunteers</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {volunteers.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
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
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    {attendees.length === 0
                      ? "No attendees uploaded yet."
                      : "No attendees match this filter."}
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((attendee) => (
                  <TableRow key={attendee.id}>
                    <TableCell className="font-medium">{attendee.name}</TableCell>
                    <TableCell className="text-xs">
                      <p>{attendee.email}</p>
                      {attendee.phone && (
                        <p className="text-muted-foreground">{attendee.phone}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[attendee.status]}>
                        {CONFIRMATION_STATUS_LABELS[attendee.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {attendee.assignedVolunteerName ?? (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {attendee.statusUpdatedAt
                        ? formatDateTime(attendee.statusUpdatedAt)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(attendee)}
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </Button>
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
        itemLabel="attendees"
      />

      {selected && (
        <AttendeeDetailDialog
          key={selected.id}
          attendee={selected}
          volunteers={volunteers}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function AttendeeDetailDialog({
  attendee,
  volunteers,
  onClose,
}: {
  attendee: ConfirmationAttendee;
  volunteers: ConfirmationVolunteer[];
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ConfirmationStatus>(attendee.status);
  const [notes, setNotes] = useState(attendee.notes ?? "");
  const [volunteerId, setVolunteerId] = useState<string>(
    attendee.assignedVolunteerId ?? "unassigned"
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!attendee) return;
    setSaving(true);
    try {
      const results = await Promise.all([
        updateAttendeeStatusAdmin(attendee.id, status, notes),
        reassignAttendeeAdmin(
          attendee.id,
          volunteerId === "unassigned" ? null : volunteerId
        ),
      ]);
      const failed = results.find((r) => !r.success);
      if (failed) {
        toast.error(failed.error ?? "Failed to save changes.");
      } else {
        toast.success("Attendee updated");
        window.location.reload();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{attendee.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">Email: </span>
              {attendee.email}
            </p>
            {attendee.phone && (
              <p>
                <span className="text-muted-foreground">Phone: </span>
                {attendee.phone}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ConfirmationStatus)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIRMATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CONFIRMATION_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assigned Volunteer</Label>
              <Select value={volunteerId} onValueChange={setVolunteerId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {volunteers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              placeholder="Call notes..."
            />
          </div>

          {attendee.extra && Object.keys(attendee.extra).length > 0 && (
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                Other CSV Fields
              </Label>
              <div className="mt-1.5 space-y-1.5 max-h-52 overflow-y-auto rounded-md border p-3">
                {Object.entries(attendee.extra).map(([key, value]) => (
                  <div key={key} className="text-xs">
                    <p className="text-muted-foreground">{key}</p>
                    <p className="whitespace-pre-wrap">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
