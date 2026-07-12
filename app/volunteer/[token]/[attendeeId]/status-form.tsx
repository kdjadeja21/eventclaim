"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Crown, Loader2, Mail, Phone, Save, Users } from "lucide-react";
import {
  CONFIRMATION_STATUSES,
  CONFIRMATION_STATUS_LABELS,
  ConfirmationAttendee,
  ConfirmationStatus,
} from "@/lib/confirmation/types";
import { Teammate, updateAttendeeStatus } from "../volunteer-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export function StatusForm({
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

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateAttendeeStatus(token, attendee.id, status, notes);
      if (res.success) {
        toast.success("Status updated");
        router.push(`/volunteer/${token}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to update status.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/80">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-3 pt-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/volunteer/${token}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-lg font-semibold tracking-tight">{attendee.name}</h1>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Contact Details</CardTitle>
              <Badge variant={statusVariant[attendee.status]}>
                {CONFIRMATION_STATUS_LABELS[attendee.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${attendee.email}`} className="hover:underline">
                {attendee.email}
              </a>
            </p>
            {attendee.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <a href={`tel:${attendee.phone}`} className="hover:underline">
                  {attendee.phone}
                </a>
              </p>
            )}
            {attendee.teamRole && (
              <p className="flex items-center gap-2">
                {attendee.teamRole === "lead" ? (
                  <Crown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Users className="h-4 w-4 text-muted-foreground" />
                )}
                {teamRoleLabel[attendee.teamRole]}
                {attendee.ticketName ? ` · ${attendee.ticketName}` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        {teammates.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Teammates ({teammates.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {teammates.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    {t.teamRole === "lead" && (
                      <Crown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {t.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {t.assignedVolunteerName && (
                      <span className="text-xs text-muted-foreground">
                        called by {t.assignedVolunteerName}
                      </span>
                    )}
                    <Badge variant={statusVariant[t.status]} className="text-[10px]">
                      {CONFIRMATION_STATUS_LABELS[t.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {attendee.extra && Object.keys(attendee.extra).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Additional Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(attendee.extra).map(([key, value]) => (
                <div key={key} className="text-xs">
                  <p className="text-muted-foreground">{key}</p>
                  <p className="whitespace-pre-wrap">{value}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2">
              {CONFIRMATION_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-sm font-medium transition-colors ${
                    status === s
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/40"
                  }`}
                >
                  {CONFIRMATION_STATUS_LABELS[s]}
                  {status === s && (
                    <Badge variant={statusVariant[s]}>Selected</Badge>
                  )}
                </button>
              ))}
            </div>

            <div>
              <Label htmlFor="notes">Call Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
                placeholder="Anything worth remembering for next time..."
              />
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Status
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
