"use client";

import {
  useState,
  useMemo,
  useTransition,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  CheckCheck,
  Ticket,
  PackageOpen,
  CircleDot,
  Link2,
  Trash2,
  UserPlus,
  UserMinus,
  Download,
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Copy,
  RefreshCw,
  AlertTriangle,
  Eye,
  EyeOff,
  X,
  Ban,
  CheckCircle,
} from "lucide-react";
import { CouponWithAttendee, CouponStats, isAssignableCoupon } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  autoAssignToAttendee,
  assignSpecificCoupon,
  unassignCoupon,
  addCoupons,
  deleteCoupon,
  bulkAutoAssignPending,
  toggleCouponDisabled,
} from "./coupon-actions";
import {
  getAssignableAttendees,
  getAvailableCoupons,
} from "./coupon-data-actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

type FilterStatus =
  | "all"
  | "available"
  | "assigned"
  | "emailSent"
  | "claimed"
  | "disabled";
type SortKey = "status" | "couponLink" | "assignedAt" | "claimedAt" | "attendeeName";
type SortDir = "asc" | "desc";

// ─── Status config ─────────────────────────────────────────────────────────────

const statusConfig = {
  available: {
    label: "Available",
    variant: "secondary" as const,
    icon: PackageOpen,
  },
  assigned: {
    label: "Assigned",
    variant: "warning" as const,
    icon: CircleDot,
  },
  emailSent: {
    label: "Email Sent",
    variant: "default" as const,
    icon: Ticket,
  },
  claimed: {
    label: "Claimed",
    variant: "success" as const,
    icon: CheckCheck,
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function compareNullable(
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

function sortCoupons(
  list: CouponWithAttendee[],
  sortConfig: { key: SortKey; dir: SortDir } | null
): CouponWithAttendee[] {
  if (!sortConfig) return list;
  const { key, dir } = sortConfig;
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (key) {
      case "status": {
        const order = ["available", "assigned", "emailSent", "claimed"];
        const cmp = order.indexOf(a.status) - order.indexOf(b.status);
        return dir === "asc" ? cmp : -cmp;
      }
      case "couponLink":
        return dir === "asc"
          ? a.couponLink.localeCompare(b.couponLink)
          : b.couponLink.localeCompare(a.couponLink);
      case "attendeeName":
        return compareNullable(a.attendeeName, b.attendeeName, dir);
      case "assignedAt":
        return compareNullable(a.assignedAt, b.assignedAt, dir);
      case "claimedAt":
        return compareNullable(a.claimedAt, b.claimedAt, dir);
      default:
        return 0;
    }
  });
  return sorted;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function truncateUrl(url: string, max = 48): string {
  return url.length > max ? url.slice(0, max) + "…" : url;
}

const MASKED_COUPON_LINK = "••••••••••••••••";

// ─── Main component ────────────────────────────────────────────────────────────

export default function CouponTable({
  coupons: initial,
  eventId,
  eventSlug,
}: {
  coupons: CouponWithAttendee[];
  eventId: string;
  eventSlug: string;
  stats: CouponStats;
}) {
  const [coupons, setCoupons] = useState(initial);
  const router = useRouter();

  useEffect(() => {
    setCoupons(initial);
  }, [initial]);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [showCouponLinks, setShowCouponLinks] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    dir: SortDir;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ─── Row selection ──────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [bulkUnassignConfirm, setBulkUnassignConfirm] = useState(false);
  const [bulkUnassignPending, setBulkUnassignPending] = useState(false);
  const [bulkDisableConfirm, setBulkDisableConfirm] = useState(false);
  const [bulkDisablePending, setBulkDisablePending] = useState(false);
  const [bulkEnableConfirm, setBulkEnableConfirm] = useState(false);
  const [bulkEnablePending, setBulkEnablePending] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setCurrentPage(1);
  }, [filter, search, sortConfig]);

  // Dialog states
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<CouponWithAttendee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CouponWithAttendee | null>(null);

  // Action loading
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Assign dialog state
  const [assignTab, setAssignTab] = useState<"auto" | "manual">("auto");
  const [autoAttendeeId, setAutoAttendeeId] = useState("");
  const [manualCouponId, setManualCouponId] = useState("");
  const [manualAttendeeId, setManualAttendeeId] = useState("");
  const [assignableAttendees, setAssignableAttendees] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [availableCoupons, setAvailableCoupons] = useState<
    Array<{ id: string; couponLink: string }>
  >([]);
  const [loadingAssignData, setLoadingAssignData] = useState(false);
  const [assignPending, setAssignPending] = useState(false);

  // Add coupons dialog state
  const [addText, setAddText] = useState("");
  const [addPending, setAddPending] = useState(false);

  // Bulk assign pending
  const [bulkPending, setBulkPending] = useState(false);

  // ─── Filtered + sorted list ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = coupons;

    if (filter === "disabled") list = list.filter((c) => c.isDisabled);
    else if (filter === "available")
      list = list.filter(isAssignableCoupon);
    else if (filter !== "all") list = list.filter((c) => c.status === filter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.couponLink.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.attendeeName ?? "").toLowerCase().includes(q) ||
          (c.attendeeEmail ?? "").toLowerCase().includes(q)
      );
    }

    return sortCoupons(list, sortConfig);
  }, [coupons, filter, search, sortConfig]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const counts = useMemo(() => ({
    all: coupons.length,
    available: coupons.filter(isAssignableCoupon).length,
    assigned: coupons.filter((c) => c.status === "assigned").length,
    emailSent: coupons.filter((c) => c.status === "emailSent").length,
    claimed: coupons.filter((c) => c.status === "claimed").length,
    disabled: coupons.filter((c) => c.isDisabled).length,
  }), [coupons]);

  // ─── Optimistic helpers ─────────────────────────────────────────────────────

  function updateCoupon(id: string, patch: Partial<CouponWithAttendee>) {
    setCoupons((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCoupon(id: string) {
    setCoupons((prev) => prev.filter((c) => c.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function addCouponToList(coupon: CouponWithAttendee) {
    setCoupons((prev) => [coupon, ...prev]);
  }

  // ─── Selection helpers ──────────────────────────────────────────────────────

  const allVisibleSelected =
    paginated.length > 0 && paginated.every((c) => selectedIds.has(c.id));
  const someVisibleSelected =
    paginated.some((c) => selectedIds.has(c.id)) && !allVisibleSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected, selectedIds, paginated]);

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((c) => next.add(c.id));
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

  const selectedCoupons = useMemo(
    () => coupons.filter((c) => selectedIds.has(c.id)),
    [coupons, selectedIds]
  );

  const bulkDeleteCount = selectedCoupons.filter(
    (c) => c.status === "available"
  ).length;
  const bulkUnassignCount = selectedCoupons.filter(
    (c) => c.status === "assigned" || c.status === "emailSent"
  ).length;
  const bulkDisableCount = selectedCoupons.filter(
    (c) => !c.isDisabled && c.status !== "claimed"
  ).length;
  const bulkEnableCount = selectedCoupons.filter(
    (c) => c.isDisabled && c.status !== "claimed"
  ).length;
  const bulkActionPending =
    bulkUnassignPending || bulkDeletePending || bulkDisablePending || bulkEnablePending;
  const hasSelection = selectedIds.size > 0;

  // ─── Sort toggle ─────────────────────────────────────────────────────────────

  function toggleSort(key: SortKey) {
    setSortConfig((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: "asc" };
    });
    setCurrentPage(1);
  }

  // ─── Assign dialog open: fetch fresh data ───────────────────────────────────

  const openAssignDialog = useCallback(async () => {
    setAssignDialogOpen(true);
    setAutoAttendeeId("");
    setManualCouponId("");
    setManualAttendeeId("");
    setLoadingAssignData(true);
    const [attendees, couponsAvail] = await Promise.all([
      getAssignableAttendees(eventId),
      getAvailableCoupons(eventId),
    ]);
    setAssignableAttendees(attendees);
    setAvailableCoupons(couponsAvail);
    setLoadingAssignData(false);
  }, [eventId]);

  // ─── Handle auto-assign ─────────────────────────────────────────────────────

  async function handleAutoAssign() {
    if (!autoAttendeeId) return;
    setAssignPending(true);
    const res = await autoAssignToAttendee(eventId, autoAttendeeId, eventSlug);
    setAssignPending(false);
    if (res.success) {
      toast.success("Coupon auto-assigned successfully.");
      setAssignDialogOpen(false);
      // Refresh list from server — simplest approach is to reload
      router.refresh();
    } else {
      toast.error(res.error ?? "Assignment failed.");
    }
  }

  // ─── Handle manual assign ───────────────────────────────────────────────────

  async function handleManualAssign() {
    if (!manualCouponId || !manualAttendeeId) return;
    setAssignPending(true);
    const res = await assignSpecificCoupon(
      eventId,
      manualCouponId,
      manualAttendeeId,
      eventSlug
    );
    setAssignPending(false);
    if (res.success) {
      toast.success("Coupon assigned successfully.");
      setAssignDialogOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Assignment failed.");
    }
  }

  // ─── Handle unassign ────────────────────────────────────────────────────────

  async function handleUnassign(coupon: CouponWithAttendee) {
    setActionPending(coupon.id + "-unassign");
    startTransition(async () => {
      const res = await unassignCoupon(eventId, coupon.id, eventSlug);
      setActionPending(null);
      if (res.success) {
        updateCoupon(coupon.id, {
          status: "available",
          assignedTo: null,
          assignedAt: null,
          claimedAt: null,
          attendeeName: null,
          attendeeEmail: null,
        });
        toast.success("Coupon unassigned.");
      } else {
        toast.error(res.error ?? "Unassign failed.");
      }
      setUnassignTarget(null);
    });
  }

  // ─── Handle delete ──────────────────────────────────────────────────────────

  async function handleToggleDisabled(coupon: CouponWithAttendee) {
    const disabled = !coupon.isDisabled;
    setActionPending(coupon.id + "-toggle-disabled");
    startTransition(async () => {
      const res = await toggleCouponDisabled(
        eventId,
        coupon.id,
        disabled,
        eventSlug
      );
      setActionPending(null);
      if (res.success) {
        updateCoupon(coupon.id, { isDisabled: disabled });
        toast.success(disabled ? "Coupon disabled." : "Coupon enabled.");
      } else {
        toast.error(res.error ?? "Update failed.");
      }
    });
  }

  async function handleDelete(coupon: CouponWithAttendee) {
    setActionPending(coupon.id + "-delete");
    startTransition(async () => {
      const res = await deleteCoupon(eventId, coupon.id, eventSlug);
      setActionPending(null);
      if (res.success) {
        removeCoupon(coupon.id);
        toast.success("Coupon deleted.");
      } else {
        toast.error(res.error ?? "Delete failed.");
      }
      setDeleteTarget(null);
    });
  }

  // ─── Handle add coupons ─────────────────────────────────────────────────────

  async function handleAddCoupons() {
    if (!addText.trim()) return;
    setAddPending(true);
    const res = await addCoupons(eventId, addText, eventSlug);
    setAddPending(false);
    if (res.success) {
      const parts: string[] = [];
      if (res.imported > 0)
        parts.push(`${res.imported} coupon${res.imported !== 1 ? "s" : ""} added`);
      if (res.autoAssigned > 0)
        parts.push(`${res.autoAssigned} auto-assigned`);
      if (res.duplicatesSkipped > 0)
        parts.push(`${res.duplicatesSkipped} duplicates skipped`);
      if (res.invalidSkipped > 0)
        parts.push(`${res.invalidSkipped} invalid skipped`);
      toast.success(parts.join(", ") || "No new coupons imported.");
      setAddText("");
      setAddDialogOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Failed to add coupons.");
    }
  }

  // ─── Handle bulk assign all pending ─────────────────────────────────────────

  async function handleBulkAssign() {
    setBulkPending(true);
    const res = await bulkAutoAssignPending(eventId, eventSlug);
    setBulkPending(false);
    if (res.success) {
      if (res.assigned > 0) {
        toast.success(
          `${res.assigned} attendee${res.assigned !== 1 ? "s" : ""} assigned coupons.`
        );
        router.refresh();
      } else {
        toast.info("No pending attendees to assign.");
      }
    } else {
      toast.error(res.error ?? "Bulk assign failed.");
    }
  }

  // ─── Handle bulk delete (available coupons only) ─────────────────────────────

  async function handleBulkDelete() {
    const targets = selectedCoupons.filter((c) => c.status === "available");
    if (targets.length === 0) return;
    setBulkDeletePending(true);
    setBulkDeleteConfirm(false);

    let deleted = 0;
    let failed = 0;
    const toastId = toast.loading(`Deleting 0 / ${targets.length}…`);

    for (let i = 0; i < targets.length; i++) {
      const coupon = targets[i];
      const res = await deleteCoupon(eventId, coupon.id, eventSlug);
      if (res.success) {
        removeCoupon(coupon.id);
        deleted++;
      } else {
        failed++;
      }
      toast.loading(`Deleting ${i + 1} / ${targets.length}…`, { id: toastId });
    }

    setBulkDeletePending(false);
    if (failed === 0) {
      toast.success(`Deleted ${deleted} coupon${deleted !== 1 ? "s" : ""}`, { id: toastId });
    } else {
      toast.warning(`Deleted ${deleted}, failed ${failed}`, { id: toastId });
    }
  }

  // ─── Handle bulk unassign (assigned / emailSent coupons) ──────────────────────

  async function handleBulkUnassign() {
    const targets = selectedCoupons.filter(
      (c) => c.status === "assigned" || c.status === "emailSent"
    );
    if (targets.length === 0) return;
    setBulkUnassignPending(true);
    setBulkUnassignConfirm(false);

    let unassigned = 0;
    let failed = 0;
    const toastId = toast.loading(`Unassigning 0 / ${targets.length}…`);

    for (let i = 0; i < targets.length; i++) {
      const coupon = targets[i];
      const res = await unassignCoupon(eventId, coupon.id, eventSlug);
      if (res.success) {
        updateCoupon(coupon.id, {
          status: "available",
          assignedTo: null,
          assignedAt: null,
          claimedAt: null,
          attendeeName: null,
          attendeeEmail: null,
        });
        unassigned++;
      } else {
        failed++;
      }
      toast.loading(`Unassigning ${i + 1} / ${targets.length}…`, { id: toastId });
    }

    setBulkUnassignPending(false);
    if (failed === 0) {
      toast.success(`Unassigned ${unassigned} coupon${unassigned !== 1 ? "s" : ""}`, { id: toastId });
    } else {
      toast.warning(`Unassigned ${unassigned}, failed ${failed}`, { id: toastId });
    }
  }

  // ─── Handle bulk disable / enable ───────────────────────────────────────────

  async function handleBulkToggleDisabled(disabled: boolean) {
    const targets = selectedCoupons.filter(
      (c) =>
        c.status !== "claimed" &&
        (disabled ? !c.isDisabled : !!c.isDisabled)
    );
    if (targets.length === 0) return;

    if (disabled) setBulkDisablePending(true);
    else setBulkEnablePending(true);
    setBulkDisableConfirm(false);
    setBulkEnableConfirm(false);

    let updated = 0;
    let failed = 0;
    const verb = disabled ? "Disabling" : "Enabling";
    const toastId = toast.loading(`${verb} 0 / ${targets.length}…`);

    for (let i = 0; i < targets.length; i++) {
      const coupon = targets[i];
      const res = await toggleCouponDisabled(
        eventId,
        coupon.id,
        disabled,
        eventSlug
      );
      if (res.success) {
        updateCoupon(coupon.id, { isDisabled: disabled });
        updated++;
      } else {
        failed++;
      }
      toast.loading(`${verb} ${i + 1} / ${targets.length}…`, { id: toastId });
    }

    setBulkDisablePending(false);
    setBulkEnablePending(false);
    const label = disabled ? "Disabled" : "Enabled";
    if (failed === 0) {
      toast.success(`${label} ${updated} coupon${updated !== 1 ? "s" : ""}`, {
        id: toastId,
      });
    } else {
      toast.warning(`${label} ${updated}, failed ${failed}`, { id: toastId });
    }
  }

  // ─── Copy coupon link ───────────────────────────────────────────────────────

  function copyLink(link: string) {
    navigator.clipboard.writeText(link).then(() => {
      toast.success("Link copied.");
    });
  }

  // ─── Export CSV ─────────────────────────────────────────────────────────────

  function exportCsv(rows?: CouponWithAttendee[]) {
    const data = rows ?? filtered;
    const headers = [
      "Coupon ID",
      "Coupon Link",
      "Status",
      "Assigned To (ID)",
      "Attendee Name",
      "Attendee Email",
      "Assigned At",
      "Claimed At",
    ];
    const csvRows = data.map((c) => [
      c.id,
      c.couponLink,
      c.status,
      c.assignedTo ?? "",
      c.attendeeName ?? "",
      c.attendeeEmail ?? "",
      c.assignedAt ?? "",
      c.claimedAt ?? "",
    ]);
    const csv = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coupons-${eventSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={cn("space-y-4", hasSelection && "pb-20")}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search link, ID, attendee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={filter}
          onValueChange={(v) => setFilter(v as FilterStatus)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({counts.all})</SelectItem>
            <SelectItem value="available">
              Available ({counts.available})
            </SelectItem>
            <SelectItem value="assigned">
              Assigned ({counts.assigned})
            </SelectItem>
            <SelectItem value="emailSent">
              Email Sent ({counts.emailSent})
            </SelectItem>
            <SelectItem value="claimed">Claimed ({counts.claimed})</SelectItem>
            <SelectItem value="disabled">
              Disabled ({counts.disabled})
            </SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant="outline"
          onClick={handleBulkAssign}
          disabled={bulkPending}
        >
          {bulkPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Assign Pending
        </Button>

        <Button size="sm" onClick={openAssignDialog}>
          <UserPlus className="h-4 w-4" />
          Assign Coupon
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Coupons
        </Button>

        <Button size="sm" variant="outline" onClick={() => exportCsv()}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
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
                  aria-label="Select all visible coupons"
                />
              </TableHead>
              <SortableHead
                label="Status"
                sortKey="status"
                sortConfig={sortConfig}
                onSort={toggleSort}
              />
              <TableHead>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleSort("couponLink")}
                    className="inline-flex items-center gap-1 font-medium hover:text-foreground text-muted-foreground transition-colors"
                  >
                    Coupon Link
                    {sortConfig?.key === "couponLink" ? (
                      sortConfig.dir === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setShowCouponLinks((v) => !v)}
                    title={
                      showCouponLinks
                        ? "Hide coupon links"
                        : "Show coupon links"
                    }
                    aria-label={
                      showCouponLinks
                        ? "Hide coupon links"
                        : "Show coupon links"
                    }
                    aria-pressed={showCouponLinks}
                  >
                    {showCouponLinks ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </TableHead>
              <SortableHead
                label="Assigned To"
                sortKey="attendeeName"
                sortConfig={sortConfig}
                onSort={toggleSort}
              />
              <SortableHead
                label="Assigned At"
                sortKey="assignedAt"
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
                  colSpan={7}
                  className="text-center py-12 text-muted-foreground text-sm"
                >
                  No coupons match this filter.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((coupon) => {
                const cfg = statusConfig[coupon.status];
                const Icon = cfg.icon;
                const isActing =
                  actionPending === coupon.id + "-unassign" ||
                  actionPending === coupon.id + "-delete" ||
                  actionPending === coupon.id + "-toggle-disabled";

                return (
                  <TableRow
                    key={coupon.id}
                    data-state={selectedIds.has(coupon.id) ? "selected" : undefined}
                    className={cn(
                      selectedIds.has(coupon.id) && "bg-muted/50",
                      coupon.isDisabled && "opacity-60"
                    )}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(coupon.id)}
                        onChange={() => toggleRow(coupon.id)}
                        className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                        aria-label={`Select coupon ${coupon.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={cfg.variant} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                        {coupon.isDisabled && (
                          <Badge variant="destructive" className="gap-1">
                            <Ban className="h-3 w-3" />
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="max-w-xs">
                      <div className="flex items-center gap-1.5">
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span
                          className="text-xs font-mono text-muted-foreground truncate"
                          title={
                            showCouponLinks ? coupon.couponLink : undefined
                          }
                        >
                          {showCouponLinks
                            ? truncateUrl(coupon.couponLink)
                            : MASKED_COUPON_LINK}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {coupon.attendeeName ? (
                        <div>
                          <div className="text-sm font-medium leading-tight">
                            {coupon.attendeeName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {coupon.attendeeEmail}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(coupon.assignedAt)}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(coupon.claimedAt)}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyLink(coupon.couponLink)}
                          title="Copy link"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>

                        {(coupon.status === "assigned" ||
                          coupon.status === "emailSent") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setUnassignTarget(coupon)}
                            disabled={isActing}
                            title="Unassign coupon"
                          >
                            {actionPending === coupon.id + "-unassign" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserMinus className="h-3.5 w-3.5" />
                            )}
                            Unassign
                          </Button>
                        )}

                        {coupon.status === "available" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(coupon)}
                            disabled={isActing}
                            className="text-destructive hover:text-destructive"
                            title="Delete coupon"
                          >
                            {actionPending === coupon.id + "-delete" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}

                        {coupon.status !== "claimed" && (
                          <Button
                            size="sm"
                            variant={coupon.isDisabled ? "outline" : "ghost"}
                            onClick={() => handleToggleDisabled(coupon)}
                            disabled={isActing}
                            title={
                              coupon.isDisabled
                                ? "Enable coupon"
                                : "Disable coupon"
                            }
                          >
                            {actionPending === coupon.id + "-toggle-disabled" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : coupon.isDisabled ? (
                              <CheckCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )}
                            {coupon.isDisabled ? "Enable" : "Disable"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        total={filtered.length}
        page={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        itemLabel="coupons"
      />

      {/* ─── Bulk action panel ─────────────────────────────────────────────────── */}
      {hasSelection && (
        <div
          role="toolbar"
          aria-label="Bulk coupon actions"
          className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:left-60"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-6 py-3">
            <span className="text-sm font-medium mr-2 shrink-0">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending || bulkUnassignCount === 0}
              onClick={() => setBulkUnassignConfirm(true)}
            >
              {bulkUnassignPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserMinus className="h-3.5 w-3.5" />
              )}
              Unassign
              {bulkUnassignCount > 0 && ` (${bulkUnassignCount})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending || bulkDisableCount === 0}
              onClick={() => setBulkDisableConfirm(true)}
            >
              {bulkDisablePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
              Disable
              {bulkDisableCount > 0 && ` (${bulkDisableCount})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending || bulkEnableCount === 0}
              onClick={() => setBulkEnableConfirm(true)}
            >
              {bulkEnablePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              Enable
              {bulkEnableCount > 0 && ` (${bulkEnableCount})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending}
              onClick={() => exportCsv(selectedCoupons)}
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={bulkActionPending || bulkDeleteCount === 0}
              onClick={() => setBulkDeleteConfirm(true)}
            >
              {bulkDeletePending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Delete
              {bulkDeleteCount > 0 && ` (${bulkDeleteCount})`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={bulkActionPending}
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3.5 w-3.5" />
              Deselect
            </Button>
          </div>
        </div>
      )}

      {/* ─── Bulk Unassign Confirm Dialog ────────────────────────────────────── */}
      <Dialog open={bulkUnassignConfirm} onOpenChange={(open) => !open && setBulkUnassignConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Unassign {bulkUnassignCount} Coupon{bulkUnassignCount !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              This will release {bulkUnassignCount} coupon{bulkUnassignCount !== 1 ? "s" : ""} back to the available pool and reset the attendees&apos; assignments. Claimed coupons will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setBulkUnassignConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleBulkUnassign}
            >
              Unassign {bulkUnassignCount}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Delete Confirm Dialog ───────────────────────────────────────── */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete {bulkDeleteCount} Coupon{bulkDeleteCount !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete {bulkDeleteCount} available coupon{bulkDeleteCount !== 1 ? "s" : ""}. Only unassigned coupons can be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setBulkDeleteConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleBulkDelete}
            >
              Delete {bulkDeleteCount}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Disable Confirm Dialog ──────────────────────────────────────── */}
      <Dialog
        open={bulkDisableConfirm}
        onOpenChange={(open) => !open && setBulkDisableConfirm(false)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-500" />
              Disable {bulkDisableCount} Coupon{bulkDisableCount !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              Disabled coupons cannot be assigned or claimed. Claimed coupons in
              your selection will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setBulkDisableConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => handleBulkToggleDisabled(true)}
            >
              Disable {bulkDisableCount}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Enable Confirm Dialog ───────────────────────────────────────── */}
      <Dialog
        open={bulkEnableConfirm}
        onOpenChange={(open) => !open && setBulkEnableConfirm(false)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Enable {bulkEnableCount} Coupon{bulkEnableCount !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              This will re-enable {bulkEnableCount} disabled coupon
              {bulkEnableCount !== 1 ? "s" : ""} for assignment and claiming.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setBulkEnableConfirm(false)}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => handleBulkToggleDisabled(false)}>
              Enable {bulkEnableCount}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Assign Coupon Dialog ─────────────────────────────────────────────── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Coupon</DialogTitle>
            <DialogDescription>
              Auto-assign the next available coupon to an attendee, or manually
              pair a specific coupon.
            </DialogDescription>
          </DialogHeader>

          {loadingAssignData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs
              value={assignTab}
              onValueChange={(v) => setAssignTab(v as "auto" | "manual")}
            >
              <TabsList className="w-full">
                <TabsTrigger value="auto" className="flex-1">
                  Auto (by attendee)
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex-1">
                  Manual pairing
                </TabsTrigger>
              </TabsList>

              <TabsContent value="auto" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Attendee</label>
                  {assignableAttendees.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No attendees waiting for a coupon.
                    </p>
                  ) : (
                    <Select
                      value={autoAttendeeId}
                      onValueChange={setAutoAttendeeId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select attendee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableAttendees.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}{" "}
                            <span className="text-muted-foreground text-xs">
                              ({a.email})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {availableCoupons.length} coupon
                  {availableCoupons.length !== 1 ? "s" : ""} available in pool.
                </p>
                <Button
                  className="w-full"
                  disabled={
                    assignPending ||
                    !autoAttendeeId ||
                    availableCoupons.length === 0
                  }
                  onClick={handleAutoAssign}
                >
                  {assignPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Assign Next Available Coupon
                </Button>
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Coupon</label>
                  {availableCoupons.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No available coupons.
                    </p>
                  ) : (
                    <Select
                      value={manualCouponId}
                      onValueChange={setManualCouponId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select coupon…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableCoupons.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <span className="font-mono text-xs">
                              {truncateUrl(c.couponLink, 40)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Attendee</label>
                  {assignableAttendees.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No attendees waiting for a coupon.
                    </p>
                  ) : (
                    <Select
                      value={manualAttendeeId}
                      onValueChange={setManualAttendeeId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select attendee…" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableAttendees.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}{" "}
                            <span className="text-muted-foreground text-xs">
                              ({a.email})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  className="w-full"
                  disabled={
                    assignPending ||
                    !manualCouponId ||
                    !manualAttendeeId ||
                    availableCoupons.length === 0
                  }
                  onClick={handleManualAssign}
                >
                  {assignPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  )}
                  Assign This Coupon
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Add Coupons Dialog ───────────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Coupons</DialogTitle>
            <DialogDescription>
              Paste one coupon URL per line. Duplicates and invalid URLs are
              skipped automatically. Available coupons will be auto-assigned to
              attendees waiting.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder={"https://example.com/coupon/abc\nhttps://example.com/coupon/def"}
            rows={8}
            className="font-mono text-xs"
          />
          <Button
            className="w-full"
            disabled={addPending || !addText.trim()}
            onClick={handleAddCoupons}
          >
            {addPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Import Coupons
          </Button>
        </DialogContent>
      </Dialog>

      {/* ─── Unassign Confirm Dialog ──────────────────────────────────────────── */}
      <Dialog
        open={unassignTarget !== null}
        onOpenChange={(open) => !open && setUnassignTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Unassign Coupon?
            </DialogTitle>
            <DialogDescription>
              This will release the coupon back to the available pool and reset
              the attendee&apos;s assignment.
            </DialogDescription>
          </DialogHeader>
          {unassignTarget && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Attendee:</span>{" "}
                <span className="font-medium">
                  {unassignTarget.attendeeName ?? "—"}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge
                  variant={statusConfig[unassignTarget.status].variant}
                  className="text-xs"
                >
                  {statusConfig[unassignTarget.status].label}
                </Badge>
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setUnassignTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={
                actionPending === (unassignTarget?.id ?? "") + "-unassign"
              }
              onClick={() => unassignTarget && handleUnassign(unassignTarget)}
            >
              {actionPending === (unassignTarget?.id ?? "") + "-unassign" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Unassign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm Dialog ────────────────────────────────────────────── */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete Coupon?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the unassigned coupon. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono break-all">
              {deleteTarget.couponLink}
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
    </div>
  );
}

// ─── Sortable header ───────────────────────────────────────────────────────────

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
