"use client";

import { useEffect, useMemo, useState, useTransition, type ElementType } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  UserMinus,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  Search,
  Mail,
  UserX,
  Link2,
  Users,
  Ticket,
  Crown,
  MessageSquareWarning,
  Check,
  X,
} from "lucide-react";
import {
  Registration,
  TeamIssue,
  TeamWithMembers,
  SuggestedLink,
} from "@/lib/types";
import {
  COMPANY_QUESTION_ID,
  ISSUE_LABELS,
  ISSUE_PRIORITY,
  LINKEDIN_QUESTION_ID,
  PRIMARY_ROLE_QUESTION_ID,
  getRegistrationField,
} from "@/lib/registrations";
import { cn, formatDateTime } from "@/lib/utils";
import { getTeamDetail } from "./team-data-actions";
import {
  assignMemberToTeam,
  acceptFuzzyLink,
  rejectFuzzyLink,
  markTeamComplete,
  removeMemberFromTeam,
} from "./team-actions";

const issueLabels = ISSUE_LABELS;

const ISSUE_META: Record<
  TeamIssue,
  { icon: ElementType; tone: "destructive" | "warning" | "info" }
> = {
  duplicate_member: { icon: Users, tone: "destructive" },
  fuzzy_match_pending: { icon: Link2, tone: "info" },
  no_lead: { icon: Crown, tone: "warning" },
  unmatched_lead: { icon: UserX, tone: "destructive" },
  missing_member: { icon: Mail, tone: "warning" },
  size_under: { icon: Users, tone: "warning" },
  size_over: { icon: Users, tone: "warning" },
  invalid_team_answer: { icon: MessageSquareWarning, tone: "warning" },
  ticket_mismatch: { icon: Ticket, tone: "info" },
};

function sortIssues(issues: TeamIssue[]): TeamIssue[] {
  return [...issues].sort((a, b) => (ISSUE_PRIORITY[a] ?? 99) - (ISSUE_PRIORITY[b] ?? 99));
}

function missingExpectedEmails(team: TeamWithMembers): string[] {
  const registered = new Set([
    ...(team.lead ? [team.lead.email.toLowerCase()] : []),
    ...team.members.map((m) => m.email.toLowerCase()),
  ]);
  return team.expectedMemberEmails.filter((e) => !registered.has(e.toLowerCase()));
}

function TeamIssuesPanel({ team }: { team: TeamWithMembers }) {
  const missingEmails = missingExpectedEmails(team);
  const sortedIssues = sortIssues(team.issues).filter(
    (issue) => !(issue === "missing_member" && missingEmails.length > 0)
  );
  const hasIssues = sortedIssues.length > 0 || missingEmails.length > 0;

  if (!hasIssues) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200/90 bg-card shadow-sm dark:border-amber-900/50">
      <div className="flex items-start gap-3 border-b border-amber-200/70 bg-amber-50/90 px-4 py-3.5 dark:border-amber-900/40 dark:bg-amber-950/40">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              Attention needed
            </h3>
            <Badge variant="warning" className="tabular-nums">
              {sortedIssues.length + (missingEmails.length > 0 ? 1 : 0)} item
              {sortedIssues.length + (missingEmails.length > 0 ? 1 : 0) !== 1 ? "s" : ""}
            </Badge>
          </div>
          {team.reviewSummary ? (
            <p className="text-sm leading-relaxed text-amber-900/80 dark:text-amber-200/80">
              {team.reviewSummary}
            </p>
          ) : (
            <p className="text-sm text-amber-900/70 dark:text-amber-200/70">
              Review the items below before marking this team complete.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {sortedIssues.map((issue) => {
          const meta = ISSUE_META[issue];
          const Icon = meta.icon;
          return (
            <div
              key={issue}
              className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
            >
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  meta.tone === "destructive" &&
                    "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
                  meta.tone === "warning" &&
                    "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
                  meta.tone === "info" &&
                    "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium leading-snug">
                  {issueLabels[issue] ?? issue}
                </p>
                <p className="text-xs text-muted-foreground">{issueHint(issue)}</p>
              </div>
            </div>
          );
        })}

        {missingEmails.length > 0 && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Expected slots
            </p>
            <ul className="space-y-1.5">
              {team.expectedMemberEmails.map((email) => {
                const isMissing = missingEmails.some(
                  (m) => m.toLowerCase() === email.toLowerCase()
                );
                const member = team.members.find(
                  (m) => m.email.toLowerCase() === email.toLowerCase()
                );
                return (
                  <li
                    key={email}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm",
                      isMissing
                        ? "border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20"
                        : "border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs sm:text-sm">{email}</span>
                    </span>
                    {isMissing ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                        <X className="h-3.5 w-3.5" />
                        Not registered
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                        {member?.name ?? "Registered"}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function issueHint(issue: TeamIssue): string {
  switch (issue) {
    case "missing_member":
      return "Someone listed on the team answer has not registered yet.";
    case "unmatched_lead":
      return "A member's lead email does not match any registration.";
    case "fuzzy_match_pending":
      return "A close email match was found — confirm or reject below.";
    case "no_lead":
      return "Pick a lead manually or fix conflicting registrations.";
    case "duplicate_member":
      return "This person appears on more than one team.";
    case "size_under":
      return "Add members from the pool or wait for registrations.";
    case "size_over":
      return "Remove a member or approve the larger team size.";
    case "invalid_team_answer":
      return "The team answer could not be parsed — consider moving to pool.";
    case "ticket_mismatch":
      return "Ticket type and team answer shape disagree (often still OK).";
    default:
      return "";
  }
}

function SuggestedLinksPanel({
  links,
  isPending,
  onAcceptLink,
  onRejectLink,
}: {
  links: SuggestedLink[];
  isPending: boolean;
  onAcceptLink: (link: SuggestedLink) => void;
  onRejectLink: (link: SuggestedLink) => void;
}) {
  if (links.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-sky-200/90 bg-card shadow-sm dark:border-sky-900/50">
      <div className="flex items-start gap-3 border-b border-sky-200/70 bg-sky-50/90 px-4 py-3.5 dark:border-sky-900/40 dark:bg-sky-950/40">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300">
          <Link2 className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-sky-950 dark:text-sky-100">
            Suggested email matches
          </h3>
          <p className="text-sm text-sky-900/70 dark:text-sky-200/70">
            These look like typos. Confirm to link them permanently on rebuild.
          </p>
        </div>
      </div>
      <ul className="divide-y">
        {links.map((link) => (
          <li
            key={`${link.fromEmail}-${link.toRegistrationId}`}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{link.fromEmail}</code>
                <span className="text-muted-foreground">→</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                  {link.toEmail}
                </code>
              </div>
              <p className="text-xs text-muted-foreground">{link.reason}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => onAcceptLink(link)}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => onRejectLink(link)}
              >
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TeamDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  teamId: string | null;
  unassignedRegistrations: Registration[];
  onUpdated: () => void;
}

function ticketBadgeVariant(category: string): "default" | "info" | "warning" | "secondary" {
  if (category === "create_team") return "default";
  if (category === "join_team") return "info";
  if (category === "find_team") return "warning";
  return "secondary";
}

function ticketLabel(category: string, ticketName?: string): string {
  if (ticketName) return ticketName;
  if (category === "create_team") return "Create a Team";
  if (category === "join_team") return "Join a Team";
  if (category === "find_team") return "Find Me a Team";
  return "Unknown";
}

export default function TeamDetailDialog({
  open,
  onOpenChange,
  slug,
  teamId,
  unassignedRegistrations,
  onUpdated,
}: TeamDetailDialogProps) {
  const [team, setTeam] = useState<TeamWithMembers | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRegId, setSelectedRegId] = useState<string>("");
  const [memberSearch, setMemberSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !teamId) {
      setTeam(null);
      setSelectedRegId("");
      setMemberSearch("");
      return;
    }

    setLoading(true);
    getTeamDetail(slug, teamId)
      .then((detail) => setTeam(detail))
      .catch(() => toast.error("Failed to load team details"))
      .finally(() => setLoading(false));
  }, [open, teamId, slug]);

  const availableToAdd = unassignedRegistrations.filter(
    (r) =>
      r.id !== team?.leadRegistrationId &&
      !team?.memberRegistrationIds.includes(r.id)
  );

  const filteredToAdd = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return availableToAdd;
    return availableToAdd.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.ticketName.toLowerCase().includes(q)
    );
  }, [availableToAdd, memberSearch]);

  const selectedRegistration = availableToAdd.find((r) => r.id === selectedRegId);

  function handleAssign() {
    if (!teamId || !selectedRegId) return;
    startTransition(async () => {
      const result = await assignMemberToTeam(slug, teamId, selectedRegId);
      if (result.success) {
        toast.success("Member assigned");
        setSelectedRegId("");
        setMemberSearch("");
        const detail = await getTeamDetail(slug, teamId);
        setTeam(detail);
        onUpdated();
      } else {
        toast.error(result.error ?? "Failed to assign member");
      }
    });
  }

  function handleRemove(registrationId: string) {
    if (!teamId) return;
    startTransition(async () => {
      const result = await removeMemberFromTeam(slug, teamId, registrationId);
      if (result.success) {
        toast.success("Member removed");
        const detail = await getTeamDetail(slug, teamId);
        setTeam(detail);
        onUpdated();
      } else {
        toast.error(result.error ?? "Failed to remove member");
      }
    });
  }

  function handleMarkComplete() {
    if (!teamId) return;
    startTransition(async () => {
      const result = await markTeamComplete(slug, teamId);
      if (result.success) {
        toast.success("Team marked complete");
        const detail = await getTeamDetail(slug, teamId);
        setTeam(detail);
        onUpdated();
      } else {
        toast.error(result.error ?? "Failed to update team");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{team?.name ?? "Team Details"}</DialogTitle>
          <DialogDescription>
            View team composition and manage member assignments.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !team ? (
          <p className="text-sm text-muted-foreground py-6">Team not found.</p>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant={ticketBadgeVariant(team.ticketCategory)}>
                {ticketLabel(team.ticketCategory, team.lead?.ticketName)}
              </Badge>
              <Badge variant={team.status === "complete" ? "success" : "warning"}>
                {team.status}
              </Badge>
              {team.source === "manual" && <Badge variant="secondary">Manual</Badge>}
            </div>

            {team.suggestedLinks && team.suggestedLinks.length > 0 && teamId && (
              <SuggestedLinksPanel
                links={team.suggestedLinks}
                isPending={isPending}
                onAcceptLink={(link) => {
                  startTransition(async () => {
                    const result = await acceptFuzzyLink(
                      slug,
                      teamId,
                      link.fromEmail,
                      link.toRegistrationId
                    );
                    if (result.success) {
                      toast.success("Link confirmed — rebuilding teams");
                      onUpdated();
                    } else {
                      toast.error(result.error ?? "Failed to accept");
                    }
                  });
                }}
                onRejectLink={(link) => {
                  startTransition(async () => {
                    const result = await rejectFuzzyLink(
                      slug,
                      teamId,
                      link.fromEmail,
                      link.toRegistrationId
                    );
                    if (result.success) {
                      toast.success("Suggestion dismissed");
                      const detail = await getTeamDetail(slug, teamId);
                      setTeam(detail);
                    } else {
                      toast.error(result.error ?? "Failed to reject");
                    }
                  });
                }}
              />
            )}

            <TeamIssuesPanel team={team} />

            {team.lead && (
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Team Lead</p>
                <p className="font-medium">{team.lead.name}</p>
                <p className="text-sm text-muted-foreground">{team.lead.email}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {getRegistrationField(team.lead, PRIMARY_ROLE_QUESTION_ID) && (
                    <span>Role: {getRegistrationField(team.lead, PRIMARY_ROLE_QUESTION_ID)}</span>
                  )}
                  {getRegistrationField(team.lead, COMPANY_QUESTION_ID) && (
                    <span>Org: {getRegistrationField(team.lead, COMPANY_QUESTION_ID)}</span>
                  )}
                  {getRegistrationField(team.lead, LINKEDIN_QUESTION_ID) && (
                    <span>LinkedIn: {getRegistrationField(team.lead, LINKEDIN_QUESTION_ID)}</span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-sm font-semibold">
                Members ({team.members.length})
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground text-sm">
                        No members yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    team.members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>{member.name}</TableCell>
                        <TableCell className="text-muted-foreground">{member.email}</TableCell>
                        <TableCell className="text-xs">{member.ticketName}</TableCell>
                        <TableCell className="text-xs">
                          {getRegistrationField(member, PRIMARY_ROLE_QUESTION_ID) ?? member.role}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isPending}
                            onClick={() => handleRemove(member.id)}
                            title="Remove member"
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Assign member manually
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search by name or email..."
                      className="pl-9"
                      disabled={availableToAdd.length === 0}
                    />
                  </div>
                  <div className="rounded-md border max-h-48 overflow-y-auto">
                    {availableToAdd.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        No available registrations
                      </p>
                    ) : filteredToAdd.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">
                        No matches for &ldquo;{memberSearch.trim()}&rdquo;
                      </p>
                    ) : (
                      filteredToAdd.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          disabled={isPending}
                          onClick={() => setSelectedRegId(r.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm border-b last:border-b-0 transition-colors hover:bg-muted/60",
                            selectedRegId === r.id && "bg-primary/10 border-primary/20"
                          )}
                        >
                          <p className="font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{r.email}</p>
                        </button>
                      ))
                    )}
                  </div>
                  {selectedRegistration && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {selectedRegistration.name} ({selectedRegistration.email})
                    </p>
                  )}
                </div>
                <Button
                  className="sm:self-end"
                  onClick={handleAssign}
                  disabled={!selectedRegId || isPending || availableToAdd.length === 0}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign"}
                </Button>
              </div>
            </div>

            {team.lead && team.lead.registrationAnswers.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Registration answers (lead)</p>
                <div className="rounded-lg border divide-y text-sm">
                  {team.lead.registrationAnswers.map((a) => (
                    <div key={a.questionId} className="p-3">
                      <p className="text-xs text-muted-foreground">{a.label}</p>
                      <p className="mt-0.5">{a.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Updated {formatDateTime(team.updatedAt)}
              </p>
              {team.status !== "complete" && (
                <Button variant="outline" size="sm" disabled={isPending} onClick={handleMarkComplete}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark complete
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
