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
  Upload,
  FileText,
} from "lucide-react";
import { Coupon, CouponLink, Grant } from "@/lib/types";
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
  autoAssignLink,
  assignSpecificLink,
  unassignLink,
  deleteLink,
  toggleLinkDisabled,
  bulkAutoAssignLinks,
  getUnassignedAttendees,
  getAvailableLinks,
} from "./link-actions";
import { addCouponLinks } from "../coupon-actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LinkRow = CouponLink & {
  attendeeName: string | null;
  attendeeEmail: string | null;
};

type GrantRow = Grant & { attendeeName: string; attendeeEmail: string };

type FilterStatus = "all" | "available" | "assigned" | "claimed" | "disabled";
type SortKey = "status" | "url" | "assignedAt" | "claimedAt" | "attendeeName";
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
  claimed: {
    label: "Claimed",
    variant: "success" as const,
    icon: CheckCheck,
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function compareNullable(a: string | null, b: string | null, dir: SortDir): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const cmp = a.localeCompare(b);
  return dir === "asc" ? cmp : -cmp;
}

function sortLinks(list: LinkRow[], sortConfig: { key: SortKey; dir: SortDir } | null): LinkRow[] {
  if (!sortConfig) return list;
  const { key, dir } = sortConfig;
  const sorted = [...list];
  sorted.sort((a, b) => {
    switch (key) {
      case "status": {
        const order = ["available", "assigned", "claimed"];
        const cmp = order.indexOf(a.status) - order.indexOf(b.status);
        return dir === "asc" ? cmp : -cmp;
      }
      case "url":
        return dir === "asc" ? a.url.localeCompare(b.url) : b.url.localeCompare(a.url);
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

const MASKED_LINK = "••••••••••••••••";

function isAssignableLink(l: LinkRow): boolean {
  return l.status === "available" && !l.isDisabled;
}

// ─── Read-only Grants table (for non-uniqueLink coupons) ──────────────────────

function GrantsReadOnly({ grants }: { grants: GrantRow[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Attendee</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Granted At</TableHead>
            <TableHead>Claimed At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grants.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-10 text-sm text-muted-foreground">
                No grants issued yet.
              </TableCell>
            </TableRow>
          ) : (
            grants.map((g) => (
              <TableRow key={`${g.attendeeId}-${g.couponId}`}>
                <TableCell className="font-medium text-sm">{g.attendeeName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{g.attendeeEmail}</TableCell>
                <TableCell className="font-mono text-xs">{g.value}</TableCell>
                <TableCell>
                  <Badge variant={g.status === "claimed" ? "success" : "secondary"} className="capitalize text-xs">
                    {g.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(g.assignedAt)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(g.claimedAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function CouponDetailTables({
  coupon,
  links: initial,
  grants,
  eventId,
  eventSlug,
}: {
  coupon: Coupon;
  links: LinkRow[];
  grants: GrantRow[];
  eventId: string;
  eventSlug: string;
}) {
  // Non-uniqueLink: show read-only grants table
  if (coupon.kind !== "uniqueLink") {
    return (
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Grants</h2>
        <GrantsReadOnly grants={grants} />
      </div>
    );
  }

  return (
    <LinkPoolTable
      coupon={coupon}
      initial={initial}
      eventId={eventId}
      eventSlug={eventSlug}
    />
  );
}

// ─── Interactive link pool table ──────────────────────────────────────────────

function LinkPoolTable({
  coupon,
  initial,
  eventId,
  eventSlug,
}: {
  coupon: Coupon;
  initial: LinkRow[];
  eventId: string;
  eventSlug: string;
}) {
  const couponId = coupon.id;
  const [links, setLinks] = useState(initial);
  const router = useRouter();

  useEffect(() => {
    setLinks(initial);
  }, [initial]);

  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [showUrls, setShowUrls] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir } | null>(null);
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
  const [unassignTarget, setUnassignTarget] = useState<LinkRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LinkRow | null>(null);

  // Action loading
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Assign dialog state
  const [assignTab, setAssignTab] = useState<"auto" | "manual">("auto");
  const [autoAttendeeId, setAutoAttendeeId] = useState("");
  const [manualLinkId, setManualLinkId] = useState("");
  const [manualAttendeeId, setManualAttendeeId] = useState("");
  const [assignableAttendees, setAssignableAttendees] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [availableLinksForDialog, setAvailableLinksForDialog] = useState<
    Array<{ id: string; url: string }>
  >([]);
  const [loadingAssignData, setLoadingAssignData] = useState(false);
  const [assignPending, setAssignPending] = useState(false);

  // Add links dialog state
  const [addText, setAddText] = useState("");
  const [addPending, setAddPending] = useState(false);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setAddText((prev) => (prev.trim() ? prev + "\n" + text : text));
    };
    reader.readAsText(file);
    // Reset so the same file can be re-selected if needed
    e.target.value = "";
  }

  // Bulk assign pending
  const [bulkPending, setBulkPending] = useState(false);

  // ─── Filtered + sorted list ─────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = links;

    if (filter === "disabled") list = list.filter((l) => l.isDisabled);
    else if (filter === "available") list = list.filter(isAssignableLink);
    else if (filter !== "all") list = list.filter((l) => l.status === filter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (l) =>
          l.url.toLowerCase().includes(q) ||
          l.id.toLowerCase().includes(q) ||
          (l.attendeeName ?? "").toLowerCase().includes(q) ||
          (l.attendeeEmail ?? "").toLowerCase().includes(q)
      );
    }

    return sortLinks(list, sortConfig);
  }, [links, filter, search, sortConfig]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const counts = useMemo(() => ({
    all: links.length,
    available: links.filter(isAssignableLink).length,
    assigned: links.filter((l) => l.status === "assigned").length,
    claimed: links.filter((l) => l.status === "claimed").length,
    disabled: links.filter((l) => l.isDisabled).length,
  }), [links]);

  // ─── Optimistic helpers ─────────────────────────────────────────────────────

  function updateLink(id: string, patch: Partial<LinkRow>) {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLink(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  // ─── Selection helpers ──────────────────────────────────────────────────────

  const allVisibleSelected =
    paginated.length > 0 && paginated.every((l) => selectedIds.has(l.id));
  const someVisibleSelected =
    paginated.some((l) => selectedIds.has(l.id)) && !allVisibleSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected, selectedIds, paginated]);

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((l) => next.delete(l.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((l) => next.add(l.id));
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

  const selectedLinks = useMemo(
    () => links.filter((l) => selectedIds.has(l.id)),
    [links, selectedIds]
  );

  const bulkDeleteCount = selectedLinks.filter((l) => l.status === "available").length;
  const bulkUnassignCount = selectedLinks.filter((l) => l.status === "assigned").length;
  const bulkDisableCount = selectedLinks.filter((l) => !l.isDisabled && l.status !== "claimed").length;
  const bulkEnableCount = selectedLinks.filter((l) => !!l.isDisabled && l.status !== "claimed").length;
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
    setManualLinkId("");
    setManualAttendeeId("");
    setLoadingAssignData(true);
    const [attendees, available] = await Promise.all([
      getUnassignedAttendees(eventId, couponId),
      getAvailableLinks(eventId, couponId),
    ]);
    setAssignableAttendees(attendees);
    setAvailableLinksForDialog(available);
    setLoadingAssignData(false);
  }, [eventId, couponId]);

  // ─── Handle auto-assign ─────────────────────────────────────────────────────

  async function handleAutoAssign() {
    if (!autoAttendeeId) return;
    setAssignPending(true);
    const res = await autoAssignLink(eventId, couponId, autoAttendeeId, eventSlug);
    setAssignPending(false);
    if (res.success) {
      toast.success("Link assigned successfully.");
      setAssignDialogOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Assignment failed.");
    }
  }

  // ─── Handle manual assign ───────────────────────────────────────────────────

  async function handleManualAssign() {
    if (!manualLinkId || !manualAttendeeId) return;
    setAssignPending(true);
    const res = await assignSpecificLink(
      eventId,
      couponId,
      manualLinkId,
      manualAttendeeId,
      eventSlug
    );
    setAssignPending(false);
    if (res.success) {
      toast.success("Link assigned successfully.");
      setAssignDialogOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Assignment failed.");
    }
  }

  // ─── Handle unassign ────────────────────────────────────────────────────────

  async function handleUnassign(link: LinkRow) {
    if (!link.assignedTo) return;
    setActionPending(link.id + "-unassign");
    startTransition(async () => {
      const res = await unassignLink(
        eventId,
        couponId,
        link.id,
        link.assignedTo!,
        eventSlug
      );
      setActionPending(null);
      if (res.success) {
        updateLink(link.id, {
          status: "available",
          assignedTo: null,
          assignedAt: null,
          claimedAt: null,
          attendeeName: null,
          attendeeEmail: null,
        });
        toast.success("Link unassigned.");
      } else {
        toast.error(res.error ?? "Unassign failed.");
      }
      setUnassignTarget(null);
    });
  }

  // ─── Handle toggle disabled ──────────────────────────────────────────────────

  async function handleToggleDisabled(link: LinkRow) {
    const disabled = !link.isDisabled;
    setActionPending(link.id + "-toggle-disabled");
    startTransition(async () => {
      const res = await toggleLinkDisabled(
        eventId,
        couponId,
        link.id,
        disabled,
        eventSlug
      );
      setActionPending(null);
      if (res.success) {
        updateLink(link.id, { isDisabled: disabled });
        toast.success(disabled ? "Link disabled." : "Link enabled.");
      } else {
        toast.error(res.error ?? "Update failed.");
      }
    });
  }

  // ─── Handle delete ──────────────────────────────────────────────────────────

  async function handleDelete(link: LinkRow) {
    setActionPending(link.id + "-delete");
    startTransition(async () => {
      const res = await deleteLink(eventId, couponId, link.id, eventSlug);
      setActionPending(null);
      if (res.success) {
        removeLink(link.id);
        toast.success("Link deleted.");
      } else {
        toast.error(res.error ?? "Delete failed.");
      }
      setDeleteTarget(null);
    });
  }

  // ─── Handle add links ────────────────────────────────────────────────────────

  async function handleAddLinks() {
    if (!addText.trim()) return;
    setAddPending(true);
    const res = await addCouponLinks(eventId, couponId, addText, eventSlug);
    setAddPending(false);
    if (res.success) {
      const parts: string[] = [];
      if (res.imported > 0)
        parts.push(`${res.imported} link${res.imported !== 1 ? "s" : ""} added`);
      if (res.autoGranted > 0)
        parts.push(`${res.autoGranted} auto-granted`);
      if (res.duplicatesSkipped > 0)
        parts.push(`${res.duplicatesSkipped} duplicates skipped`);
      if (res.invalidSkipped > 0)
        parts.push(`${res.invalidSkipped} invalid skipped`);
      toast.success(parts.join(", ") || "No new links imported.");
      setAddText("");
      setAddDialogOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Failed to add links.");
    }
  }

  // ─── Handle bulk assign all pending ─────────────────────────────────────────

  async function handleBulkAssign() {
    setBulkPending(true);
    const res = await bulkAutoAssignLinks(eventId, couponId, eventSlug);
    setBulkPending(false);
    if (res.success) {
      if (res.assigned > 0) {
        toast.success(
          `${res.assigned} attendee${res.assigned !== 1 ? "s" : ""} assigned links.`
        );
        router.refresh();
      } else {
        toast.info("No pending attendees to assign.");
      }
    } else {
      toast.error(res.error ?? "Bulk assign failed.");
    }
  }

  // ─── Handle bulk delete ──────────────────────────────────────────────────────

  async function handleBulkDelete() {
    const targets = selectedLinks.filter((l) => l.status === "available");
    if (targets.length === 0) return;
    setBulkDeletePending(true);
    setBulkDeleteConfirm(false);

    let deleted = 0;
    let failed = 0;
    const toastId = toast.loading(`Deleting 0 / ${targets.length}…`);
    for (let i = 0; i < targets.length; i++) {
      const link = targets[i];
      const res = await deleteLink(eventId, couponId, link.id, eventSlug);
      if (res.success) {
        removeLink(link.id);
        deleted++;
      } else {
        failed++;
      }
      toast.loading(`Deleting ${i + 1} / ${targets.length}…`, { id: toastId });
    }
    setBulkDeletePending(false);
    if (failed === 0) {
      toast.success(`Deleted ${deleted} link${deleted !== 1 ? "s" : ""}`, { id: toastId });
    } else {
      toast.warning(`Deleted ${deleted}, failed ${failed}`, { id: toastId });
    }
  }

  // ─── Handle bulk unassign ────────────────────────────────────────────────────

  async function handleBulkUnassign() {
    const targets = selectedLinks.filter((l) => l.status === "assigned" && l.assignedTo);
    if (targets.length === 0) return;
    setBulkUnassignPending(true);
    setBulkUnassignConfirm(false);

    let unassigned = 0;
    let failed = 0;
    const toastId = toast.loading(`Unassigning 0 / ${targets.length}…`);
    for (let i = 0; i < targets.length; i++) {
      const link = targets[i];
      const res = await unassignLink(eventId, couponId, link.id, link.assignedTo!, eventSlug);
      if (res.success) {
        updateLink(link.id, {
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
      toast.success(`Unassigned ${unassigned} link${unassigned !== 1 ? "s" : ""}`, { id: toastId });
    } else {
      toast.warning(`Unassigned ${unassigned}, failed ${failed}`, { id: toastId });
    }
  }

  // ─── Handle bulk disable / enable ────────────────────────────────────────────

  async function handleBulkToggleDisabled(disabled: boolean) {
    const targets = selectedLinks.filter(
      (l) => l.status !== "claimed" && (disabled ? !l.isDisabled : !!l.isDisabled)
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
      const link = targets[i];
      const res = await toggleLinkDisabled(eventId, couponId, link.id, disabled, eventSlug);
      if (res.success) {
        updateLink(link.id, { isDisabled: disabled });
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
      toast.success(`${label} ${updated} link${updated !== 1 ? "s" : ""}`, { id: toastId });
    } else {
      toast.warning(`${label} ${updated}, failed ${failed}`, { id: toastId });
    }
  }

  // ─── Copy link URL ───────────────────────────────────────────────────────────

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Link copied.");
    });
  }

  // ─── Export CSV ─────────────────────────────────────────────────────────────

  function exportCsv(rows?: LinkRow[]) {
    const data = rows ?? filtered;
    const headers = [
      "Link ID",
      "URL",
      "Status",
      "Disabled",
      "Assigned To (ID)",
      "Attendee Name",
      "Attendee Email",
      "Assigned At",
      "Claimed At",
    ];
    const csvRows = data.map((l) => [
      l.id,
      l.url,
      l.status,
      l.isDisabled ? "true" : "false",
      l.assignedTo ?? "",
      l.attendeeName ?? "",
      l.attendeeEmail ?? "",
      l.assignedAt ?? "",
      l.claimedAt ?? "",
    ]);
    const csv = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `links-${coupon.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
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

        <Select value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({counts.all})</SelectItem>
            <SelectItem value="available">Available ({counts.available})</SelectItem>
            <SelectItem value="assigned">Assigned ({counts.assigned})</SelectItem>
            <SelectItem value="claimed">Claimed ({counts.claimed})</SelectItem>
            <SelectItem value="disabled">Disabled ({counts.disabled})</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" onClick={handleBulkAssign} disabled={bulkPending}>
          {bulkPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Assign Pending
        </Button>

        <Button size="sm" onClick={openAssignDialog}>
          <UserPlus className="h-4 w-4" />
          Assign Link
        </Button>

        <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Links
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
                  aria-label="Select all visible links"
                />
              </TableHead>
              <SortableHead label="Status" sortKey="status" sortConfig={sortConfig} onSort={toggleSort} />
              <TableHead>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggleSort("url")}
                    className="inline-flex items-center gap-1 font-medium hover:text-foreground text-muted-foreground transition-colors"
                  >
                    Coupon Link
                    {sortConfig?.key === "url" ? (
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
                    onClick={() => setShowUrls((v) => !v)}
                    title={showUrls ? "Hide links" : "Show links"}
                    aria-pressed={showUrls}
                  >
                    {showUrls ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </TableHead>
              <SortableHead label="Assigned To" sortKey="attendeeName" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableHead label="Assigned At" sortKey="assignedAt" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableHead label="Claimed At" sortKey="claimedAt" sortConfig={sortConfig} onSort={toggleSort} />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  No links match this filter.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((link) => {
                const cfg = statusConfig[link.status];
                const Icon = cfg.icon;
                const isActing =
                  actionPending === link.id + "-unassign" ||
                  actionPending === link.id + "-delete" ||
                  actionPending === link.id + "-toggle-disabled";

                return (
                  <TableRow
                    key={link.id}
                    data-state={selectedIds.has(link.id) ? "selected" : undefined}
                    className={cn(
                      selectedIds.has(link.id) && "bg-muted/50",
                      link.isDisabled && "opacity-60"
                    )}
                  >
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(link.id)}
                        onChange={() => toggleRow(link.id)}
                        className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                        aria-label={`Select link ${link.id}`}
                      />
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={cfg.variant} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {cfg.label}
                        </Badge>
                        {link.isDisabled && (
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
                          title={showUrls ? link.url : undefined}
                        >
                          {showUrls ? truncateUrl(link.url) : MASKED_LINK}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {link.attendeeName ? (
                        <div>
                          <div className="text-sm font-medium leading-tight">{link.attendeeName}</div>
                          <div className="text-xs text-muted-foreground">{link.attendeeEmail}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(link.assignedAt)}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(link.claimedAt)}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyUrl(link.url)}
                          title="Copy link"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>

                        {link.status === "assigned" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setUnassignTarget(link)}
                            disabled={isActing}
                            title="Unassign link"
                          >
                            {actionPending === link.id + "-unassign" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserMinus className="h-3.5 w-3.5" />
                            )}
                            Unassign
                          </Button>
                        )}

                        {link.status === "available" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(link)}
                            disabled={isActing}
                            className="text-destructive hover:text-destructive"
                            title="Delete link"
                          >
                            {actionPending === link.id + "-delete" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        )}

                        {link.status !== "claimed" && (
                          <Button
                            size="sm"
                            variant={link.isDisabled ? "outline" : "ghost"}
                            onClick={() => handleToggleDisabled(link)}
                            disabled={isActing}
                            title={link.isDisabled ? "Enable link" : "Disable link"}
                          >
                            {actionPending === link.id + "-toggle-disabled" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : link.isDisabled ? (
                              <CheckCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Ban className="h-3.5 w-3.5" />
                            )}
                            {link.isDisabled ? "Enable" : "Disable"}
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
        onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
        itemLabel="links"
      />

      {/* ─── Bulk action panel ─────────────────────────────────────────────────── */}
      {hasSelection && (
        <div
          role="toolbar"
          aria-label="Bulk link actions"
          className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:left-60"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-6 py-3">
            <span className="text-sm font-medium mr-2 shrink-0">{selectedIds.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending || bulkUnassignCount === 0}
              onClick={() => setBulkUnassignConfirm(true)}
            >
              {bulkUnassignPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
              Unassign{bulkUnassignCount > 0 && ` (${bulkUnassignCount})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending || bulkDisableCount === 0}
              onClick={() => setBulkDisableConfirm(true)}
            >
              {bulkDisablePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              Disable{bulkDisableCount > 0 && ` (${bulkDisableCount})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending || bulkEnableCount === 0}
              onClick={() => setBulkEnableConfirm(true)}
            >
              {bulkEnablePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
              Enable{bulkEnableCount > 0 && ` (${bulkEnableCount})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkActionPending}
              onClick={() => exportCsv(selectedLinks)}
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
              {bulkDeletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete{bulkDeleteCount > 0 && ` (${bulkDeleteCount})`}
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

      {/* ─── Bulk Unassign Confirm ────────────────────────────────────────────── */}
      <Dialog open={bulkUnassignConfirm} onOpenChange={(open) => !open && setBulkUnassignConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Unassign {bulkUnassignCount} Link{bulkUnassignCount !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              This will release {bulkUnassignCount} link{bulkUnassignCount !== 1 ? "s" : ""} back to the available pool and remove the attendees&apos; grants.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBulkUnassignConfirm(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleBulkUnassign}>Unassign {bulkUnassignCount}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Delete Confirm ──────────────────────────────────────────────── */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={(open) => !open && setBulkDeleteConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete {bulkDeleteCount} Link{bulkDeleteCount !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete {bulkDeleteCount} available link{bulkDeleteCount !== 1 ? "s" : ""}. Only unassigned links can be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBulkDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleBulkDelete}>Delete {bulkDeleteCount}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Disable Confirm ─────────────────────────────────────────────── */}
      <Dialog open={bulkDisableConfirm} onOpenChange={(open) => !open && setBulkDisableConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-amber-500" />
              Disable {bulkDisableCount} Link{bulkDisableCount !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              Disabled links cannot be assigned. Claimed links in your selection will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBulkDisableConfirm(false)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={() => handleBulkToggleDisabled(true)}>Disable {bulkDisableCount}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Enable Confirm ──────────────────────────────────────────────── */}
      <Dialog open={bulkEnableConfirm} onOpenChange={(open) => !open && setBulkEnableConfirm(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Enable {bulkEnableCount} Link{bulkEnableCount !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              This will re-enable {bulkEnableCount} disabled link{bulkEnableCount !== 1 ? "s" : ""} for assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setBulkEnableConfirm(false)}>Cancel</Button>
            <Button className="flex-1" onClick={() => handleBulkToggleDisabled(false)}>Enable {bulkEnableCount}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Assign Link Dialog ───────────────────────────────────────────────── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Link</DialogTitle>
            <DialogDescription>
              Auto-assign the next available link to an attendee, or manually pair a specific link.
            </DialogDescription>
          </DialogHeader>

          {loadingAssignData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs value={assignTab} onValueChange={(v) => setAssignTab(v as "auto" | "manual")}>
              <TabsList className="w-full">
                <TabsTrigger value="auto" className="flex-1">Auto (by attendee)</TabsTrigger>
                <TabsTrigger value="manual" className="flex-1">Manual pairing</TabsTrigger>
              </TabsList>

              <TabsContent value="auto" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Attendee</label>
                  {assignableAttendees.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No attendees waiting for a link.</p>
                  ) : (
                    <Select value={autoAttendeeId} onValueChange={setAutoAttendeeId}>
                      <SelectTrigger><SelectValue placeholder="Select attendee…" /></SelectTrigger>
                      <SelectContent>
                        {assignableAttendees.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}{" "}
                            <span className="text-muted-foreground text-xs">({a.email})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {availableLinksForDialog.length} link{availableLinksForDialog.length !== 1 ? "s" : ""} available in pool.
                </p>
                <Button
                  className="w-full"
                  disabled={assignPending || !autoAttendeeId || availableLinksForDialog.length === 0}
                  onClick={handleAutoAssign}
                >
                  {assignPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Assign Next Available Link
                </Button>
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Link</label>
                  {availableLinksForDialog.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No available links.</p>
                  ) : (
                    <Select value={manualLinkId} onValueChange={setManualLinkId}>
                      <SelectTrigger><SelectValue placeholder="Select link…" /></SelectTrigger>
                      <SelectContent>
                        {availableLinksForDialog.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            <span className="font-mono text-xs">{truncateUrl(l.url, 40)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Attendee</label>
                  {assignableAttendees.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No attendees waiting for a link.</p>
                  ) : (
                    <Select value={manualAttendeeId} onValueChange={setManualAttendeeId}>
                      <SelectTrigger><SelectValue placeholder="Select attendee…" /></SelectTrigger>
                      <SelectContent>
                        {assignableAttendees.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name}{" "}
                            <span className="text-muted-foreground text-xs">({a.email})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  className="w-full"
                  disabled={assignPending || !manualLinkId || !manualAttendeeId || availableLinksForDialog.length === 0}
                  onClick={handleManualAssign}
                >
                  {assignPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Assign This Link
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Add Links Dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={addDialogOpen}
        onOpenChange={(open) => {
          setAddDialogOpen(open);
          if (!open) { setAddText(""); setCsvFileName(null); }
        }}
      >
        <DialogContent className="flex flex-col gap-4 w-[calc(100vw-2rem)] sm:w-full max-w-md max-h-[90dvh] overflow-y-auto p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add Links</DialogTitle>
            <DialogDescription>
              Upload a CSV file or paste URLs below — one per line. Duplicates and invalid entries are skipped. Available links are auto-assigned to waiting attendees.
            </DialogDescription>
          </DialogHeader>

          {/* CSV upload zone */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-wrap items-center gap-3 rounded-md border border-dashed px-4 py-3 text-left hover:bg-muted/40 transition-colors w-full"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm truncate text-muted-foreground">
                {csvFileName ?? "Choose a CSV file…"}
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-sm shrink-0">
              <Upload className="h-3.5 w-3.5" />
              Upload
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={handleCsvUpload}
            />
          </button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                or paste URLs
              </span>
            </div>
          </div>

          <Textarea
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            placeholder={"https://example.com/coupon/abc\nhttps://example.com/coupon/def"}
            rows={6}
            className="font-mono text-xs resize-none"
          />

          <Button
            className="w-full"
            disabled={addPending || !addText.trim()}
            onClick={handleAddLinks}
          >
            {addPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Import Links
          </Button>
        </DialogContent>
      </Dialog>

      {/* ─── Unassign Confirm Dialog ──────────────────────────────────────────── */}
      <Dialog open={unassignTarget !== null} onOpenChange={(open) => !open && setUnassignTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Unassign Link?
            </DialogTitle>
            <DialogDescription>
              This will release the link back to the available pool and remove the attendee&apos;s grant.
            </DialogDescription>
          </DialogHeader>
          {unassignTarget && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Attendee:</span>{" "}
                <span className="font-medium">{unassignTarget.attendeeName ?? "—"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge variant={statusConfig[unassignTarget.status].variant} className="text-xs">
                  {statusConfig[unassignTarget.status].label}
                </Badge>
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setUnassignTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={actionPending === (unassignTarget?.id ?? "") + "-unassign"}
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
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete Link?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the unassigned link. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono break-all">
              {deleteTarget.url}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={actionPending === (deleteTarget?.id ?? "") + "-delete"}
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
