"use client";

import { useEffect, useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, UserMinus, UserPlus, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Registration,
  TeamIssue,
  TeamWithMembers,
} from "@/lib/types";
import {
  COMPANY_QUESTION_ID,
  LINKEDIN_QUESTION_ID,
  PRIMARY_ROLE_QUESTION_ID,
  getRegistrationField,
} from "@/lib/registrations";
import { formatDateTime } from "@/lib/utils";
import { getTeamDetail } from "./team-data-actions";
import {
  assignMemberToTeam,
  markTeamComplete,
  removeMemberFromTeam,
} from "./team-actions";

const issueLabels: Record<TeamIssue, string> = {
  missing_member: "Expected member not registered",
  unmatched_lead: "Team lead not found",
  invalid_team_answer: "Invalid team answer",
  no_lead: "No team lead assigned",
};

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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !teamId) {
      setTeam(null);
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

  function handleAssign() {
    if (!teamId || !selectedRegId) return;
    startTransition(async () => {
      const result = await assignMemberToTeam(slug, teamId, selectedRegId);
      if (result.success) {
        toast.success("Member assigned");
        setSelectedRegId("");
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

            {team.issues.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-medium text-sm mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  Issues
                </div>
                <ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1 list-disc pl-5">
                  {team.issues.map((issue) => (
                    <li key={issue}>{issueLabels[issue] ?? issue}</li>
                  ))}
                  {team.expectedMemberEmails
                    .filter((e) => !team.members.some((m) => m.email === e))
                    .map((email) => (
                      <li key={email}>Missing registration: {email}</li>
                    ))}
                </ul>
              </div>
            )}

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
                <Select value={selectedRegId} onValueChange={setSelectedRegId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select registration to add..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableToAdd.length === 0 ? (
                      <SelectItem value="_none" disabled>
                        No available registrations
                      </SelectItem>
                    ) : (
                      availableToAdd.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} ({r.email})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
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
