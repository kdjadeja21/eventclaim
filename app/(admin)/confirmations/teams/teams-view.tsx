"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Crown,
  Loader2,
  RefreshCw,
  Users,
  UserX,
} from "lucide-react";
import {
  CONFIRMATION_STATUS_LABELS,
  ConfirmationAttendee,
  ConfirmationTeam,
  ConfirmationTeamFormationStats,
  ConfirmationTeamIssue,
  ConfirmationTeamStatus,
} from "@/lib/confirmation/types";
import { confirmSuggestedLinkAction, resolveTeamsAction } from "./team-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const statusVariant: Record<
  ConfirmationTeamStatus,
  "success" | "warning" | "destructive"
> = {
  complete: "success",
  incomplete: "warning",
  needs_review: "destructive",
};

const statusLabel: Record<ConfirmationTeamStatus, string> = {
  complete: "Complete",
  incomplete: "Incomplete",
  needs_review: "Needs Review",
};

const issueLabel: Record<ConfirmationTeamIssue, string> = {
  no_lead: "No lead identified",
  duplicate_member: "Duplicate member",
  missing_member: "Missing member",
  unmatched_lead: "Lead email not found",
  fuzzy_match_pending: "Possible typo",
  size_under: "Below minimum size",
  size_over: "Above maximum size",
};

export function TeamsView({
  teams,
  attendees,
  stats,
}: {
  teams: ConfirmationTeam[];
  attendees: ConfirmationAttendee[];
  stats: ConfirmationTeamFormationStats;
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<"all" | ConfirmationTeamStatus>("all");
  const [resolving, setResolving] = useState(false);

  const attendeeMap = useMemo(
    () => new Map(attendees.map((a) => [a.id, a])),
    [attendees]
  );

  const pool = useMemo(() => attendees.filter((a) => a.inPool), [attendees]);

  const filteredTeams = useMemo(() => {
    const list =
      statusFilter === "all" ? teams : teams.filter((t) => t.status === statusFilter);
    return [...list].sort((a, b) => {
      const order: Record<ConfirmationTeamStatus, number> = {
        needs_review: 0,
        incomplete: 1,
        complete: 2,
      };
      return order[a.status] - order[b.status];
    });
  }, [teams, statusFilter]);

  async function handleResolve() {
    setResolving(true);
    try {
      const res = await resolveTeamsAction();
      if (res.success) {
        toast.success(
          `Resolved ${res.stats?.formedTeams ?? 0} teams (${res.stats?.needsReviewTeams ?? 0} need review)`
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to resolve teams.");
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
          <StatPill label="Teams" value={stats.formedTeams} />
          <StatPill label="Complete" value={stats.completeTeams} variant="success" />
          <StatPill label="Incomplete" value={stats.incompleteTeams} variant="warning" />
          <StatPill
            label="Needs Review"
            value={stats.needsReviewTeams}
            variant="destructive"
          />
          <StatPill label="In Pool" value={stats.poolCount} />
        </div>
        <Button onClick={handleResolve} disabled={resolving}>
          {resolving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Resolve Teams
        </Button>
      </div>

      <Select
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as "all" | ConfirmationTeamStatus)}
      >
        <SelectTrigger className="w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All teams ({teams.length})</SelectItem>
          <SelectItem value="needs_review">
            Needs Review ({stats.needsReviewTeams})
          </SelectItem>
          <SelectItem value="incomplete">Incomplete ({stats.incompleteTeams})</SelectItem>
          <SelectItem value="complete">Complete ({stats.completeTeams})</SelectItem>
        </SelectContent>
      </Select>

      {filteredTeams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {teams.length === 0
              ? 'No teams formed yet. Upload a CSV with ticket + team-email columns, then click "Resolve Teams". Existing imports can be fixed by Resolve (it recovers emails from stored fields) or by re-uploading the CSV.'
              : "No teams match this filter."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredTeams.map((team) => (
            <TeamCard key={team.id} team={team} attendeeMap={attendeeMap} />
          ))}
        </div>
      )}

      {pool.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold gradient-text uppercase tracking-wider flex items-center gap-2">
            <UserX className="h-4 w-4" />
            Pool ({pool.length}) — not on any team
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {pool.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 p-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] whitespace-nowrap">
                      {a.teamIntent?.kind ?? "individual"}
                      {a.teamIntent?.quality && a.teamIntent.quality !== "ok"
                        ? ` · ${a.teamIntent.quality}`
                        : ""}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant?: "success" | "warning" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-lg font-semibold">
          {variant ? <Badge variant={variant}>{value}</Badge> : value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function TeamCard({
  team,
  attendeeMap,
}: {
  team: ConfirmationTeam;
  attendeeMap: Map<string, ConfirmationAttendee>;
}) {
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const router = useRouter();
  const lead = team.leadAttendeeId ? attendeeMap.get(team.leadAttendeeId) : null;

  async function handleConfirm(
    referencingAttendeeId: string,
    wrongEmail: string,
    correctedAttendeeId: string,
    key: string
  ) {
    setConfirmingKey(key);
    try {
      const res = await confirmSuggestedLinkAction(
        referencingAttendeeId,
        wrongEmail,
        correctedAttendeeId
      );
      if (res.success) {
        toast.success("Match confirmed, teams re-resolved");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to confirm match.");
      }
    } finally {
      setConfirmingKey(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Crown className="h-4 w-4 text-muted-foreground" />
              {lead ? `${lead.name}'s Team` : "Unassigned Team"}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {team.sizeActual} of {team.sizeExpected} expected members
            </CardDescription>
          </div>
          <Badge variant={statusVariant[team.status]}>{statusLabel[team.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {team.reviewSummary && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {team.reviewSummary}
          </p>
        )}

        {team.issues.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {team.issues.map((issue) => (
              <Badge key={issue} variant="outline" className="text-[10px]">
                {issueLabel[issue]}
              </Badge>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          {lead && (
            <MemberRow attendee={lead} roleLabel="Lead" icon={Crown} />
          )}
          {team.memberAttendeeIds.map((id) => {
            const member = attendeeMap.get(id);
            if (!member) return null;
            return <MemberRow key={id} attendee={member} roleLabel="Member" icon={Users} />;
          })}
        </div>

        {team.expectedMemberEmails.filter(
          (email) => !team.memberAttendeeIds.some((id) => attendeeMap.get(id)?.email === email)
        ).length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Expected but not found
            </p>
            {team.expectedMemberEmails
              .filter(
                (email) =>
                  !team.memberAttendeeIds.some((id) => attendeeMap.get(id)?.email === email)
              )
              .map((email) => {
                const suggestion = team.suggestedLinks.find((s) => s.fromEmail === email);
                const key = `${team.id}-${email}`;
                return (
                  <div
                    key={email}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs"
                  >
                    <span className="text-muted-foreground truncate">{email}</span>
                    {suggestion ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        disabled={confirmingKey === key}
                        onClick={() =>
                          handleConfirm(
                            team.leadAttendeeId!,
                            suggestion.fromEmail,
                            suggestion.toAttendeeId,
                            key
                          )
                        }
                        title={suggestion.reason}
                      >
                        {confirmingKey === key ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Confirm match: {attendeeMap.get(suggestion.toAttendeeId)?.name}
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Not registered
                      </Badge>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {team.confidence > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confidence: {Math.round(team.confidence * 100)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({
  attendee,
  roleLabel,
  icon: Icon,
}: {
  attendee: ConfirmationAttendee;
  roleLabel: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-1.5 min-w-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate">{attendee.name}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">
          {roleLabel}
        </Badge>
      </span>
      <Badge variant="secondary" className="text-[10px] shrink-0">
        {CONFIRMATION_STATUS_LABELS[attendee.status]}
      </Badge>
    </div>
  );
}
