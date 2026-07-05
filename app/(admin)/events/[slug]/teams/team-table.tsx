"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Loader2,
  Users,
  AlertTriangle,
  Settings2,
  RotateCcw,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  Event,
  Registration,
  Team,
  TeamFormationStats,
  TeamIssue,
  TicketCategory,
  TeamStatus,
} from "@/lib/types";
import {
  ISSUE_LABELS,
  ISSUE_PRIORITY,
  PRIMARY_ROLE_QUESTION_ID,
  getRegistrationField,
} from "@/lib/registrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatDateTime } from "@/lib/utils";
import TeamDetailDialog from "./team-detail-dialog";
import TeamRulesEditor from "./team-rules-editor";
import {
  TeamSyncProgressDialog,
  initialSyncProgress,
  type SyncProgressState,
} from "./team-sync-progress-dialog";
import {
  rebuildTeams,
  deleteAllTeamData,
  getSyncPrepData,
  upsertRegistrationBatch,
  finalizeLumaSync,
  fetchLumaGuestsPageForSync,
  bulkAssignToTeam,
  moveRegistrationToPool,
  acceptFuzzyLink,
  rejectFuzzyLink,
} from "./team-actions";
import type { FetchAllGuestsParams } from "@/lib/luma";
import LumaFetchDialog, {
  LumaFetchConfig,
  defaultConfig,
  getStoredConfig,
  saveStoredConfig,
} from "../attendees/luma-fetch-dialog";

type TeamStatusFilter = "all" | TeamStatus;

interface TeamTableProps {
  teams: Team[];
  registrations: Registration[];
  eventSlug: string;
  eventId: string;
  event: Event;
  lumaApiEnabled: boolean;
  lumaEventId: string | null;
  initialLumaLastSyncedAt: string | null;
  stats: TeamFormationStats & { totalRegistrations: number };
}

function ticketLabel(category: TicketCategory, ticketName?: string): string {
  if (category === "create_team") return ticketName ?? "Create a Team";
  if (category === "join_team") return ticketName ?? "Join a Team";
  if (category === "find_team") return ticketName ?? "Find Me a Team";
  return ticketName ?? "Unknown";
}

function ticketBadgeVariant(
  category: TicketCategory
): "default" | "info" | "warning" | "secondary" {
  if (category === "create_team") return "default";
  if (category === "join_team") return "info";
  if (category === "find_team") return "warning";
  return "secondary";
}

function statusBadgeVariant(
  status: TeamStatus
): "success" | "warning" | "secondary" | "info" | "destructive" {
  if (status === "complete") return "success";
  if (status === "incomplete") return "warning";
  if (status === "needs_review") return "destructive";
  if (status === "manual") return "info";
  return "secondary";
}

function teamRoles(team: Team, regById: Map<string, Registration>): string[] {
  const ids = [
    ...(team.leadRegistrationId ? [team.leadRegistrationId] : []),
    ...team.memberRegistrationIds,
  ];
  const roles = new Set<string>();
  for (const id of ids) {
    const reg = regById.get(id);
    if (!reg) continue;
    const role = getRegistrationField(reg, PRIMARY_ROLE_QUESTION_ID) ?? reg.role;
    if (role) roles.add(role);
  }
  return [...roles];
}

function reviewPriority(team: Team): number {
  if (team.issues.length === 0) return 99;
  return Math.min(...team.issues.map((i) => ISSUE_PRIORITY[i] ?? 99));
}

export default function TeamTable({
  teams: initialTeams,
  registrations: initialRegistrations,
  eventSlug,
  event,
  lumaApiEnabled,
  lumaEventId,
  initialLumaLastSyncedAt,
  stats,
}: TeamTableProps) {
  const [teams, setTeams] = useState(initialTeams);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [activeTab, setActiveTab] = useState("teams");
  const [search, setSearch] = useState("");
  const [teamStatusFilter, setTeamStatusFilter] = useState<TeamStatusFilter>("all");
  const [poolSearch, setPoolSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [poolPage, setPoolPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [lumaDialogOpen, setLumaDialogOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(initialLumaLastSyncedAt);
  const [isSyncing, startSync] = useTransition();
  const [isRebuilding, startRebuild] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [isBulkAssigning, startBulkAssign] = useTransition();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [syncProgress, setSyncProgress] = useState<SyncProgressState>(initialSyncProgress);
  const [selectedPoolIds, setSelectedPoolIds] = useState<Set<string>>(new Set());
  const [bulkTeamId, setBulkTeamId] = useState<string>("");

  const [lumaConfig, setLumaConfig] = useState<LumaFetchConfig>(() => ({
    ...defaultConfig,
    lumaEventId: lumaEventId ?? "",
    approvalStatus: "pending_approval",
    checkedInOnly: false,
  }));

  useEffect(() => {
    setTeams(initialTeams);
    setRegistrations(initialRegistrations);
  }, [initialTeams, initialRegistrations]);

  useEffect(() => {
    const stored = getStoredConfig(eventSlug);
    if (stored) {
      setLumaConfig((prev) => ({
        ...stored,
        lumaEventId: lumaEventId ?? stored.lumaEventId,
        checkedInOnly: false,
      }));
    } else if (lumaEventId) {
      setLumaConfig((prev) => ({ ...prev, lumaEventId }));
    }
  }, [eventSlug, lumaEventId]);

  const regById = useMemo(
    () => new Map(registrations.map((r) => [r.id, r])),
    [registrations]
  );

  const formedTeams = useMemo(
    () => teams.filter((t) => t.status !== "needs_review"),
    [teams]
  );

  const reviewTeams = useMemo(
    () =>
      [...teams.filter((t) => t.status === "needs_review")].sort(
        (a, b) => reviewPriority(a) - reviewPriority(b)
      ),
    [teams]
  );

  const poolList = useMemo(
    () => registrations.filter((r) => !r.teamId && (r.inPool ?? r.ticketCategory === "find_team")),
    [registrations]
  );

  const filteredTeams = useMemo(() => {
    let list = formedTeams;
    if (teamStatusFilter !== "all") {
      list = list.filter((t) => t.status === teamStatusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => {
        const lead = t.leadRegistrationId ? regById.get(t.leadRegistrationId) : null;
        return (
          t.name.toLowerCase().includes(q) ||
          (t.leadEmail?.toLowerCase().includes(q) ?? false) ||
          (lead?.name.toLowerCase().includes(q) ?? false) ||
          t.memberEmails.some((e) => e.toLowerCase().includes(q))
        );
      });
    }
    return list;
  }, [formedTeams, teamStatusFilter, search, regById]);

  const filteredPool = useMemo(() => {
    if (!poolSearch.trim()) return poolList;
    const q = poolSearch.trim().toLowerCase();
    return poolList.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.ticketName.toLowerCase().includes(q)
    );
  }, [poolList, poolSearch]);

  const paginatedTeams = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTeams.slice(start, start + pageSize);
  }, [filteredTeams, currentPage, pageSize]);

  const paginatedPool = useMemo(() => {
    const start = (poolPage - 1) * pageSize;
    return filteredPool.slice(start, start + pageSize);
  }, [filteredPool, poolPage, pageSize]);

  const assignableTeams = useMemo(
    () => teams.filter((t) => t.status !== "complete" || t.source === "manual"),
    [teams]
  );

  useEffect(() => setCurrentPage(1), [teamStatusFilter, search, pageSize]);
  useEffect(() => setPoolPage(1), [poolSearch, pageSize]);

  function buildLumaParams(): FetchAllGuestsParams {
    return {
      event_id: lumaConfig.lumaEventId.trim(),
      ...(lumaConfig.approvalStatus !== "any"
        ? { approval_status: lumaConfig.approvalStatus }
        : {}),
      ...(lumaConfig.sortColumn !== "none" ? { sort_column: lumaConfig.sortColumn } : {}),
      ...(lumaConfig.sortDirection !== "none"
        ? { sort_direction: lumaConfig.sortDirection }
        : {}),
    };
  }

  async function runChunkedSync() {
    saveStoredConfig(eventSlug, lumaConfig);
    const lumaParams = buildLumaParams();

    setSyncProgress({
      open: true,
      phase: "preparing",
      processed: 0,
      fetched: 0,
      message: "Loading attendee data…",
    });

    const prep = await getSyncPrepData(eventSlug);
    if (prep.error) {
      setSyncProgress({
        open: true,
        phase: "error",
        processed: 0,
        fetched: 0,
        message: prep.error,
        error: prep.error,
      });
      return;
    }

    let cursor: string | undefined;
    let totalFetched = 0;
    let totalSaved = 0;
    let pageIndex = 0;

    try {
      for (;;) {
        setSyncProgress((prev) => ({
          ...prev,
          phase: "fetching",
          message: `Fetching page ${pageIndex + 1} from Luma…`,
        }));

        const page = await fetchLumaGuestsPageForSync({
          ...lumaParams,
          pagination_cursor: cursor,
        });

        if (page.error) throw new Error(page.error);
        if (page.entries.length === 0 && pageIndex === 0) break;

        totalFetched += page.entries.length;

        setSyncProgress({
          open: true,
          phase: "saving",
          processed: totalSaved,
          fetched: totalFetched,
          message: `Saving batch ${pageIndex + 1} (${page.entries.length} records)…`,
        });

        const batchResult = await upsertRegistrationBatch(
          eventSlug,
          page.entries,
          prep.attendeeEmails
        );

        if (batchResult.error) throw new Error(batchResult.error);
        totalSaved += batchResult.saved;

        if (!page.has_more || !page.next_cursor) break;
        cursor = page.next_cursor;
        pageIndex++;
      }

      setSyncProgress({
        open: true,
        phase: "building",
        processed: totalSaved,
        fetched: totalFetched,
        message: "Building teams from registrations…",
      });

      const final = await finalizeLumaSync(
        eventSlug,
        lumaParams.event_id,
        totalFetched,
        totalSaved
      );

      if (final.error) throw new Error(final.error);

      setLastSyncedAt(final.syncedAt);
      setSyncProgress({
        open: true,
        phase: "done",
        processed: totalSaved,
        fetched: totalFetched,
        message: `Synced ${totalSaved} registrations. ${final.teamsCreated} teams created, ${final.teamsUpdated} updated.`,
      });

      toast.success(
        `Synced ${totalSaved} registrations. ${final.teamsCreated} teams created, ${final.teamsUpdated} updated.`
      );

      setTimeout(() => {
        setSyncProgress(initialSyncProgress);
        window.location.reload();
      }, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed.";
      setSyncProgress({
        open: true,
        phase: "error",
        processed: totalSaved,
        fetched: totalFetched,
        message: msg,
        error: msg,
      });
      toast.error(msg);
      setTimeout(() => setSyncProgress(initialSyncProgress), 3000);
    }
  }

  function handleSync() {
    if (!lumaConfig.lumaEventId.trim()) {
      setLumaDialogOpen(true);
      toast.error("Set a Luma event ID first.");
      return;
    }
    startSync(() => void runChunkedSync());
  }

  function handleDeleteAll() {
    startDelete(async () => {
      const result = await deleteAllTeamData(eventSlug, deleteConfirmText);
      if (result.success) {
        toast.success(
          `Deleted ${result.deletedRegistrations} registrations and ${result.deletedTeams} teams.`
        );
        setDeleteDialogOpen(false);
        setDeleteConfirmText("");
        window.location.reload();
      } else {
        toast.error(result.error ?? "Delete failed.");
      }
    });
  }

  function handleRebuild() {
    startRebuild(async () => {
      const result = await rebuildTeams(eventSlug);
      if (result.success) {
        toast.success("Teams rebuilt from registrations");
        window.location.reload();
      } else {
        toast.error(result.error ?? "Rebuild failed");
      }
    });
  }

  function openTeamDetail(teamId: string) {
    setSelectedTeamId(teamId);
    setDetailOpen(true);
  }

  function togglePoolSelection(id: string) {
    setSelectedPoolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkAssign() {
    if (!bulkTeamId || selectedPoolIds.size === 0) return;
    startBulkAssign(async () => {
      const result = await bulkAssignToTeam(
        eventSlug,
        bulkTeamId,
        [...selectedPoolIds]
      );
      if (result.success) {
        toast.success(`Assigned ${result.assigned} member(s)`);
        window.location.reload();
      } else {
        toast.error(result.error ?? "Bulk assign failed");
      }
    });
  }

  function memberPreview(team: Team): string {
    const names = team.memberRegistrationIds
      .slice(0, 3)
      .map((id) => regById.get(id)?.name)
      .filter(Boolean);
    const extra =
      team.memberRegistrationIds.length > 3
        ? ` +${team.memberRegistrationIds.length - 3}`
        : "";
    return names.length ? names.join(", ") + extra : "—";
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Formed teams", value: stats.formedTeams },
          { label: "Complete", value: stats.completeTeams },
          { label: "Incomplete", value: stats.incompleteTeams },
          { label: "Needs review", value: stats.needsReviewTeams },
          { label: "Unassigned pool", value: stats.poolCount },
          { label: "Auto-resolved", value: `${stats.autoResolvedPercent}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <TeamRulesEditor eventSlug={eventSlug} event={event} />
        <Button
          variant="outline"
          size="sm"
          disabled={isRebuilding || isSyncing}
          onClick={handleRebuild}
        >
          {isRebuilding ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4 mr-2" />
          )}
          Rebuild
        </Button>
        {(teams.length > 0 || registrations.length > 0) && (
          <Button
            variant="outline"
            size="sm"
            disabled={isDeleting || isSyncing}
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete all
          </Button>
        )}
        {lumaApiEnabled && (
          <>
            <Button variant="outline" size="sm" onClick={() => setLumaDialogOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Luma config
            </Button>
            <Button size="sm" disabled={isSyncing || isDeleting} onClick={handleSync}>
              {isSyncing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync from Luma
            </Button>
          </>
        )}
      </div>

      {lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced: {formatDateTime(lastSyncedAt)}
          {lumaEventId && ` · Luma event ${lumaEventId}`}
          {` · ${stats.totalRegistrations} registrations`}
        </p>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="teams">Teams ({formedTeams.length})</TabsTrigger>
          <TabsTrigger value="pool">Unassigned Pool ({poolList.length})</TabsTrigger>
          <TabsTrigger value="review">Review Queue ({reviewTeams.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team, lead, or member..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={teamStatusFilter}
              onValueChange={(v) => setTeamStatusFilter(v as TeamStatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="incomplete">Incomplete</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TeamsTableBody
            rows={paginatedTeams}
            regById={regById}
            emptyMessage={
              teams.length === 0
                ? "No teams yet. Sync registrations from Luma to get started."
                : "No teams match your filters."
            }
            onRowClick={openTeamDetail}
            memberPreview={memberPreview}
            showConfidence
          />

          <TablePagination
            total={filteredTeams.length}
            page={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            itemLabel="teams"
          />
        </TabsContent>

        <TabsContent value="pool" className="space-y-4 mt-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search pool by name or email..."
                value={poolSearch}
                onChange={(e) => setPoolSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {selectedPoolIds.size > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <Select value={bulkTeamId} onValueChange={setBulkTeamId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Assign to team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!bulkTeamId || isBulkAssigning}
                  onClick={handleBulkAssign}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign {selectedPoolIds.size} selected
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Ticket</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPool.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No unassigned registrations in the pool.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPool.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedPoolIds.has(reg.id)}
                          onChange={() => togglePoolSelection(reg.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{reg.name}</TableCell>
                      <TableCell className="text-muted-foreground">{reg.email}</TableCell>
                      <TableCell className="text-xs">
                        {getRegistrationField(reg, PRIMARY_ROLE_QUESTION_ID) ?? reg.role}
                      </TableCell>
                      <TableCell>
                        <Badge variant={ticketBadgeVariant(reg.ticketCategory)}>
                          {ticketLabel(reg.ticketCategory, reg.ticketName)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            total={filteredPool.length}
            page={poolPage}
            pageSize={pageSize}
            onPageChange={setPoolPage}
            onPageSizeChange={setPageSize}
            itemLabel="registrations"
          />
        </TabsContent>

        <TabsContent value="review" className="space-y-4 mt-4">
          {reviewTeams.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center text-muted-foreground">
              No items need review. Great job!
            </div>
          ) : (
            reviewTeams.map((team) => (
              <ReviewCard
                key={team.id}
                team={team}
                regById={regById}
                eventSlug={eventSlug}
                onOpen={() => openTeamDetail(team.id)}
                onUpdated={() => window.location.reload()}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <TeamDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        slug={eventSlug}
        teamId={selectedTeamId}
        unassignedRegistrations={poolList}
        onUpdated={() => window.location.reload()}
      />

      {lumaApiEnabled && (
        <LumaFetchDialog
          open={lumaDialogOpen}
          onOpenChange={setLumaDialogOpen}
          eventSlug={eventSlug}
          lastSyncedAt={lastSyncedAt}
          isFetching={isSyncing}
          lastRunStatus={null}
          config={lumaConfig}
          onConfigChange={(cfg) => {
            setLumaConfig({ ...cfg, checkedInOnly: false });
            saveStoredConfig(eventSlug, { ...cfg, checkedInOnly: false });
          }}
          onFetchNow={handleSync}
        />
      )}

      <TeamSyncProgressDialog state={syncProgress} />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete all team records?</DialogTitle>
            <DialogDescription>
              This permanently removes all registrations and teams for this event.
              Attendee records are not affected. Type <strong>DELETE ALL</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-confirm">Confirmation</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE ALL"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== "DELETE ALL" || isDeleting}
              onClick={handleDeleteAll}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete all records
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TeamsTableBody({
  rows,
  regById,
  emptyMessage,
  onRowClick,
  memberPreview,
  showConfidence,
}: {
  rows: Team[];
  regById: Map<string, Registration>;
  emptyMessage: string;
  onRowClick: (id: string) => void;
  memberPreview: (team: Team) => string;
  showConfidence?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team / Lead</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Issues</TableHead>
            {showConfidence && <TableHead>Confidence</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={showConfidence ? 6 : 5}
                className="text-center py-12 text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((team) => {
              const lead = team.leadRegistrationId
                ? regById.get(team.leadRegistrationId)
                : null;
              const memberCount =
                team.memberRegistrationIds.length + (team.leadRegistrationId ? 1 : 0);
              const roles = teamRoles(team, regById);

              return (
                <TableRow
                  key={team.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onRowClick(team.id)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium">{team.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead?.email ?? team.leadEmail ?? "No lead"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                        {memberPreview(team)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {team.sizeActual ?? memberCount}
                      {team.sizeExpected ? ` / ${team.sizeExpected}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {roles.slice(0, 3).map((role) => (
                        <Badge key={role} variant="secondary" className="text-xs">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(team.status)}>{team.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {team.issues.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {team.issues.length}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {showConfidence && (
                    <TableCell className="text-xs text-muted-foreground">
                      {team.confidence != null
                        ? `${Math.round(team.confidence * 100)}%`
                        : "—"}
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ReviewCard({
  team,
  regById,
  eventSlug,
  onOpen,
  onUpdated,
}: {
  team: Team;
  regById: Map<string, Registration>;
  eventSlug: string;
  onOpen: () => void;
  onUpdated: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const lead = team.leadRegistrationId ? regById.get(team.leadRegistrationId) : null;
  const topIssue = team.issues[0];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{team.name}</p>
          <p className="text-sm text-muted-foreground">
            {team.reviewSummary ?? (topIssue ? ISSUE_LABELS[topIssue] : "Needs review")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onOpen}>
          Open team
        </Button>
      </div>

      {lead?.teamAnswerRaw && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
          Answer: {lead.teamAnswerRaw.slice(0, 200)}
          {lead.teamAnswerRaw.length > 200 ? "…" : ""}
        </p>
      )}

      {team.suggestedLinks && team.suggestedLinks.length > 0 && (
        <div className="space-y-2">
          {team.suggestedLinks.map((link) => (
            <div
              key={`${link.fromEmail}-${link.toRegistrationId}`}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm border rounded-md p-2"
            >
              <span>
                Did you mean <strong>{link.toEmail}</strong> for{" "}
                <code className="text-xs">{link.fromEmail}</code>?
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await acceptFuzzyLink(
                        eventSlug,
                        team.id,
                        link.fromEmail,
                        link.toRegistrationId
                      );
                      if (result.success) {
                        toast.success("Link confirmed");
                        onUpdated();
                      } else {
                        toast.error(result.error ?? "Failed");
                      }
                    })
                  }
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await rejectFuzzyLink(
                        eventSlug,
                        team.id,
                        link.fromEmail,
                        link.toRegistrationId
                      );
                      if (result.success) {
                        toast.success("Dismissed");
                        onUpdated();
                      } else {
                        toast.error(result.error ?? "Failed");
                      }
                    })
                  }
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {team.issues.map((issue: TeamIssue) => (
          <Badge key={issue} variant="warning" className="text-xs">
            {ISSUE_LABELS[issue]}
          </Badge>
        ))}
        {team.memberRegistrationIds.map((id) => {
          const reg = regById.get(id);
          if (!reg) return null;
          return (
            <Button
              key={id}
              size="sm"
              variant="ghost"
              className="text-xs h-7"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await moveRegistrationToPool(eventSlug, id);
                  if (result.success) {
                    toast.success("Moved to pool");
                    onUpdated();
                  } else {
                    toast.error(result.error ?? "Failed");
                  }
                })
              }
            >
              Move {reg.name} to pool
            </Button>
          );
        })}
      </div>
    </div>
  );
}
