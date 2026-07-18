"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Crown,
  Loader2,
  Mail,
  Phone,
  Save,
  Users,
} from "lucide-react";
import {
  CONFIRMATION_STATUSES,
  CONFIRMATION_STATUS_LABELS,
  ConfirmationAttendee,
  ConfirmationStatus,
} from "@/lib/confirmation/types";
import {
  Teammate,
  updateAttendeeStatus,
  updateTeamStatus,
} from "../volunteer-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const teamRoleLabel = {
  lead: "Team Lead",
  member: "Team Member",
  individual: "Individual",
} as const;

export function AttendeeDetail({
  token,
  attendee,
  teammates,
}: {
  token: string;
  attendee: ConfirmationAttendee;
  teammates: Teammate[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ConfirmationStatus>(attendee.status);
  const [notes, setNotes] = useState(attendee.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [memberStatus, setMemberStatus] = useState<Record<string, ConfirmationStatus>>(
    () => Object.fromEntries(teammates.map((t) => [t.id, t.status]))
  );
  const [memberSaving, setMemberSaving] = useState<string | null>(null);

  const updatableTeammates = useMemo(
    () => teammates.filter((t) => t.canUpdate),
    [teammates]
  );
  const hasTeam = teammates.length > 0;
  const extraEntries = attendee.extra ? Object.entries(attendee.extra) : [];

  async function handleSaveFocus() {
    setSaving(true);
    try {
      const res = await updateAttendeeStatus(token, attendee.id, status, notes);
      if (res.success) {
        toast.success("Status updated");
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to update status.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMember(member: Teammate) {
    setMemberSaving(member.id);
    try {
      const nextStatus = memberStatus[member.id] ?? member.status;
      const res = await updateAttendeeStatus(token, member.id, nextStatus);
      if (res.success) {
        toast.success(`Updated ${member.name}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to update teammate.");
      }
    } finally {
      setMemberSaving(null);
    }
  }

  async function handleSaveEntireTeam() {
    setSavingTeam(true);
    try {
      const res = await updateTeamStatus(token, attendee.id, status, notes);
      if (res.success) {
        toast.success(
          `Updated ${res.updated} team member${res.updated !== 1 ? "s" : ""}`
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to update team.");
      }
    } finally {
      setSavingTeam(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/80">
      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-10">
        <div className="flex items-center gap-3 pt-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/volunteer/${token}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight truncate">
              {attendee.name}
            </h1>
            {attendee.teamRole && attendee.teamRole !== "individual" && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {attendee.teamRole === "lead" ? (
                  <Crown className="h-3 w-3" />
                ) : (
                  <Users className="h-3 w-3" />
                )}
                {teamRoleLabel[attendee.teamRole]}
                {hasTeam ? ` · team of ${teammates.length + 1}` : ""}
              </p>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Contact</CardTitle>
              <Badge variant={statusVariant[attendee.status]}>
                {CONFIRMATION_STATUS_LABELS[attendee.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${attendee.email}`} className="hover:underline break-all">
                {attendee.email}
              </a>
            </p>
            {attendee.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`tel:${attendee.phone}`} className="hover:underline">
                  {attendee.phone}
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        {hasTeam && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Entire team ({teammates.length + 1})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {teammates.map((member) => (
                <div
                  key={member.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm flex items-center gap-1.5">
                        {member.teamRole === "lead" && (
                          <Crown className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate">{member.name}</span>
                      </p>
                      <p className="text-xs text-muted-foreground break-all">
                        {member.email}
                      </p>
                      {member.phone && (
                        <a
                          href={`tel:${member.phone}`}
                          className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {member.phone}
                        </a>
                      )}
                      {!member.canUpdate && member.assignedVolunteerName && (
                        <p className="text-[11px] text-amber-700 mt-1">
                          Assigned to {member.assignedVolunteerName} — view only
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={statusVariant[member.status]}
                      className="shrink-0 text-[10px]"
                    >
                      {CONFIRMATION_STATUS_LABELS[member.status]}
                    </Badge>
                  </div>

                  {member.canUpdate && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={memberStatus[member.id] ?? member.status}
                        onValueChange={(v) =>
                          setMemberStatus((prev) => ({
                            ...prev,
                            [member.id]: v as ConfirmationStatus,
                          }))
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
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
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={memberSaving === member.id}
                        onClick={() => handleSaveMember(member)}
                      >
                        {memberSaving === member.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          "Save"
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {hasTeam ? `Update ${attendee.name}` : "Update status"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <Label htmlFor="notes">Call notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
                rows={3}
                placeholder="Anything worth remembering for next time..."
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleSaveFocus} disabled={saving || savingTeam}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save {attendee.name.split(" ")[0]}
              </Button>

              {hasTeam && updatableTeammates.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={handleSaveEntireTeam}
                  disabled={saving || savingTeam}
                >
                  {savingTeam ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                  Apply status to entire team ({updatableTeammates.length + 1})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {extraEntries.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Additional info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {extraEntries.map(([key, value]) => (
                <div key={key} className="text-xs">
                  <p className="text-muted-foreground">{key}</p>
                  <p className="whitespace-pre-wrap">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
