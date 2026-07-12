"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Crown, Loader2, Mail, Phone, Save, Users } from "lucide-react";
import {
  CONFIRMATION_STATUSES,
  CONFIRMATION_STATUS_LABELS,
  ConfirmationAttendee,
  ConfirmationStatus,
} from "@/lib/confirmation/types";
import { getTeammates, Teammate, updateAttendeeStatus } from "./volunteer-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

export function AttendeeStatusDialog({
  token,
  attendee,
  onClose,
  onSaved,
}: {
  token: string;
  attendee: ConfirmationAttendee;
  onClose: () => void;
  onSaved: (updated: ConfirmationAttendee) => void;
}) {
  const [status, setStatus] = useState<ConfirmationStatus>(attendee.status);
  const [notes, setNotes] = useState(attendee.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [teammatesLoading, setTeammatesLoading] = useState(!!attendee.teamKey);

  useEffect(() => {
    if (!attendee.teamKey) return;
    let cancelled = false;
    getTeammates(token, attendee.id).then((result) => {
      if (cancelled) return;
      setTeammates(result);
      setTeammatesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, attendee.id, attendee.teamKey]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await updateAttendeeStatus(token, attendee.id, status, notes);
      if (res.success) {
        toast.success("Status updated");
        onSaved({
          ...attendee,
          status,
          notes,
          statusUpdatedAt: new Date().toISOString(),
        });
      } else {
        toast.error(res.error ?? "Failed to update status.");
      }
    } finally {
      setSaving(false);
    }
  }

  const extraEntries = attendee.extra ? Object.entries(attendee.extra) : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{attendee.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <div className="text-sm space-y-1">
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a href={`mailto:${attendee.email}`} className="hover:underline">
                {attendee.email}
              </a>
            </p>
            {attendee.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <a href={`tel:${attendee.phone}`} className="hover:underline">
                  {attendee.phone}
                </a>
              </p>
            )}
            {attendee.teamRole && (
              <p className="flex items-center gap-2">
                {attendee.teamRole === "lead" ? (
                  <Crown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                {teamRoleLabel[attendee.teamRole]}
              </p>
            )}
          </div>

          {teammatesLoading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading teammates…
            </p>
          ) : (
            teammates.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                  Teammates ({teammates.length})
                </Label>
                <div className="mt-1.5 space-y-1 rounded-md border p-2.5">
                  {teammates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="flex items-center gap-1">
                        {t.teamRole === "lead" && <Crown className="h-3 w-3" />}
                        {t.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {t.assignedVolunteerName && (
                          <span className="text-muted-foreground">
                            called by {t.assignedVolunteerName}
                          </span>
                        )}
                        <Badge variant={statusVariant[t.status]} className="text-[10px]">
                          {CONFIRMATION_STATUS_LABELS[t.status]}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ConfirmationStatus)}>
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
            <Label htmlFor="notes">Call Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              rows={3}
              placeholder="Anything worth remembering for next time..."
            />
          </div>

          {extraEntries.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowExtra((v) => !v)}
                className="text-xs text-primary hover:underline"
              >
                {showExtra ? "Hide" : "Show"} additional info ({extraEntries.length})
              </button>
              {showExtra && (
                <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto rounded-md border p-2.5">
                  {extraEntries.map(([key, value]) => (
                    <div key={key} className="text-xs">
                      <p className="text-muted-foreground">{key}</p>
                      <p className="whitespace-pre-wrap">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Status
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
