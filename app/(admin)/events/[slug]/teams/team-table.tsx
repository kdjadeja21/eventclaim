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
} from "lucide-react";
import { Registration, Team, TicketCategory, TeamStatus } from "@/lib/types";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatDateTime } from "@/lib/utils";
import TeamDetailDialog from "./team-detail-dialog";
import { syncLumaRegistrations, rebuildTeams } from "./team-actions";
import LumaFetchDialog, {
  LumaFetchConfig,
  defaultConfig,
  getStoredConfig,
  saveStoredConfig,
} from "../attendees/luma-fetch-dialog";

type TicketFilter =
  | "all"
  | "create_team"
  | "join_team"
  | "find_team"
  | "incomplete";

interface TeamTableProps {
  teams: Team[];
  registrations: Registration[];
  eventSlug: string;
  eventId: string;
  lumaApiEnabled: boolean;
  lumaEventId: string | null;
  initialLumaLastSyncedAt: string | null;
  stats: {
    totalTeams: number;
    createTeam: number;
    joinTeam: number;
    findTeam: number;
    incomplete: number;
    unassigned: number;
  };
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
): "success" | "warning" | "secondary" | "info" {
  if (status === "complete") return "success";
  if (status === "incomplete") return "warning";
  if (status === "manual") return "info";
  return "secondary";
}

export default function TeamTable({
  teams: initialTeams,
  registrations: initialRegistrations,
  eventSlug,
  lumaApiEnabled,
  lumaEventId,
  initialLumaLastSyncedAt,
  stats,
}: TeamTableProps) {
  const [teams, setTeams] = useState(initialTeams);
  const [registrations, setRegistrations] = useState(initialRegistrations);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TicketFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [lumaDialogOpen, setLumaDialogOpen] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(initialLumaLastSyncedAt);
  const [isSyncing, startSync] = useTransition();
  const [isRebuilding, startRebuild] = useTransition();

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

  const filtered = useMemo(() => {
    let list = teams;

    if (filter === "create_team") list = list.filter((t) => t.ticketCategory === "create_team");
    else if (filter === "join_team") list = list.filter((t) => t.ticketCategory === "join_team");
    else if (filter === "find_team") list = list.filter((t) => t.ticketCategory === "find_team");
    else if (filter === "incomplete")
      list = list.filter((t) => t.status === "incomplete" || t.status === "unassigned");

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => {
        const lead = t.leadRegistrationId ? regById.get(t.leadRegistrationId) : null;
        const leadMatch =
          t.name.toLowerCase().includes(q) ||
          (t.leadEmail?.toLowerCase().includes(q) ?? false) ||
          (lead?.name.toLowerCase().includes(q) ?? false);
        const memberMatch =
          t.memberEmails.some((e) => e.toLowerCase().includes(q)) ||
          t.memberRegistrationIds.some((id) => {
            const m = regById.get(id);
            return m?.name.toLowerCase().includes(q) ?? false;
          });
        return leadMatch || memberMatch;
      });
    }

    return list;
  }, [teams, filter, search, regById]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search, pageSize]);

  const unassignedRegistrations = useMemo(
    () =>
      registrations.filter(
        (r) =>
          !r.teamId ||
          r.ticketCategory === "find_team" ||
          r.role === "individual"
      ),
    [registrations]
  );

  function handleSync() {
    if (!lumaConfig.lumaEventId.trim()) {
      setLumaDialogOpen(true);
      toast.error("Set a Luma event ID first.");
      return;
    }

    startSync(async () => {
      saveStoredConfig(eventSlug, lumaConfig);
      const result = await syncLumaRegistrations(eventSlug, {
        event_id: lumaConfig.lumaEventId.trim(),
        ...(lumaConfig.approvalStatus !== "any"
          ? { approval_status: lumaConfig.approvalStatus }
          : {}),
        ...(lumaConfig.sortColumn !== "none"
          ? { sort_column: lumaConfig.sortColumn }
          : {}),
        ...(lumaConfig.sortDirection !== "none"
          ? { sort_direction: lumaConfig.sortDirection }
          : {}),
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setLastSyncedAt(result.syncedAt);
      toast.success(
        `Synced ${result.syncedCount} registrations. ${result.teamsCreated} teams created, ${result.teamsUpdated} updated.`
      );
      window.location.reload();
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
          { label: "Total teams", value: stats.totalTeams },
          { label: "Create a Team", value: stats.createTeam },
          { label: "Join a Team", value: stats.joinTeam },
          { label: "Find Me a Team", value: stats.findTeam },
          { label: "Incomplete", value: stats.incomplete },
          { label: "Unassigned", value: stats.unassigned },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search team, lead, or member..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as TicketFilter)}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by ticket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ticket types</SelectItem>
              <SelectItem value="create_team">Create a Team</SelectItem>
              <SelectItem value="join_team">Join a Team</SelectItem>
              <SelectItem value="find_team">Find Me a Team</SelectItem>
              <SelectItem value="incomplete">Incomplete / Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isRebuilding}
            onClick={handleRebuild}
          >
            {isRebuilding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Rebuild
          </Button>
          {lumaApiEnabled && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLumaDialogOpen(true)}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Luma config
              </Button>
              <Button size="sm" disabled={isSyncing} onClick={handleSync}>
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
      </div>

      {lastSyncedAt && (
        <p className="text-xs text-muted-foreground">
          Last synced: {formatDateTime(lastSyncedAt)}
          {lumaEventId && ` · Luma event ${lumaEventId}`}
        </p>
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team / Lead</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Ticket type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Issues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  {teams.length === 0
                    ? "No teams yet. Sync registrations from Luma to get started."
                    : "No teams match your filters."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((team) => {
                const lead = team.leadRegistrationId
                  ? regById.get(team.leadRegistrationId)
                  : null;
                const memberCount = team.memberRegistrationIds.length + (lead ? 1 : 0);

                return (
                  <TableRow
                    key={team.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openTeamDetail(team.id)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium">{team.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {lead?.email ?? team.leadEmail ?? "No lead"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{memberCount}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {memberPreview(team)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ticketBadgeVariant(team.ticketCategory)}>
                        {ticketLabel(team.ticketCategory, lead?.ticketName)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(team.status)}>
                        {team.status}
                      </Badge>
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
        itemLabel="teams"
      />

      <TeamDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        slug={eventSlug}
        teamId={selectedTeamId}
        unassignedRegistrations={unassignedRegistrations}
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
    </div>
  );
}
