"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Check,
  Plus,
  Loader2,
  KeyRound,
  Ban,
  CheckCircle2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  createVolunteerAction,
  resetVolunteerPinAction,
  toggleVolunteerActiveAction,
} from "./volunteer-actions";
import { ConfirmationVolunteerStats } from "@/lib/confirmation/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "@/components/ui/dialog";

export function VolunteersTable({
  volunteerStats,
  baseUrl,
}: {
  volunteerStats: ConfirmationVolunteerStats[];
  baseUrl: string;
}) {
  const [stats, setStats] = useState(volunteerStats);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealedPins, setRevealedPins] = useState<Record<string, string>>({});

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await createVolunteerAction(name.trim(), username.trim() || undefined);
      if (res.success && res.volunteer) {
        toast.success(`Volunteer "${name.trim()}" created`);
        setName("");
        setUsername("");
        setStats((prev) => [
          {
            volunteer: res.volunteer!,
            total: 0,
            byStatus: {
              need_confirmation: 0,
              call_pending: 0,
              call_done: 0,
              confirm_coming: 0,
              not_coming: 0,
            },
          },
          ...prev,
        ]);
      } else {
        toast.error(res.error ?? "Failed to create volunteer.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    const res = await toggleVolunteerActiveAction(id, isActive);
    if (res.success) {
      setStats((prev) =>
        prev.map((s) =>
          s.volunteer.id === id
            ? { ...s, volunteer: { ...s.volunteer, isActive } }
            : s
        )
      );
      toast.success(isActive ? "Volunteer reactivated" : "Volunteer deactivated");
    } else {
      toast.error(res.error ?? "Failed to update volunteer.");
    }
  }

  async function handleResetPin(id: string) {
    const res = await resetVolunteerPinAction(id);
    if (res.success && res.pin) {
      setRevealedPins((prev) => ({ ...prev, [id]: res.pin! }));
      toast.success("PIN reset");
    } else {
      toast.error(res.error ?? "Failed to reset PIN.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Volunteer</CardTitle>
          <CardDescription>
            Generates a unique link and 4-digit PIN. Share both out-of-band.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-40">
              <Label htmlFor="volunteer-name">Name</Label>
              <Input
                id="volunteer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1"
              />
            </div>
            <div className="flex-1 min-w-40">
              <Label htmlFor="volunteer-username">Username (optional)</Label>
              <Input
                id="volunteer-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jane"
                className="mt-1"
              />
            </div>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Link</TableHead>
                <TableHead>PIN</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground text-sm"
                  >
                    No volunteers yet. Create one above.
                  </TableCell>
                </TableRow>
              ) : (
                stats.map(({ volunteer, total, byStatus }) => (
                  <TableRow key={volunteer.id}>
                    <TableCell className="font-medium">
                      {volunteer.name}
                      <p className="text-xs text-muted-foreground font-mono">
                        @{volunteer.username}
                      </p>
                    </TableCell>
                    <TableCell>
                      <CopyLinkButton link={`${baseUrl}/volunteer/${volunteer.token}`} />
                    </TableCell>
                    <TableCell>
                      <PinCell
                        revealedPin={revealedPins[volunteer.id]}
                        onReveal={() =>
                          setRevealedPins((prev) => ({
                            ...prev,
                            [volunteer.id]: volunteer.pin,
                          }))
                        }
                        onHide={() =>
                          setRevealedPins((prev) => {
                            const next = { ...prev };
                            delete next[volunteer.id];
                            return next;
                          })
                        }
                        onReset={() => handleResetPin(volunteer.id)}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {total} total ·{" "}
                      <span className="text-muted-foreground">
                        {byStatus.call_done + byStatus.confirm_coming + byStatus.not_coming}{" "}
                        done
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={volunteer.isActive ? "success" : "secondary"}>
                        {volunteer.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleToggleActive(volunteer.id, !volunteer.isActive)
                        }
                      >
                        {volunteer.isActive ? (
                          <>
                            <Ban className="h-4 w-4" /> Deactivate
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Activate
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        toast.success("Link copied");
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:underline max-w-56 truncate"
      title={link}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="truncate">{link}</span>
    </button>
  );
}

function PinCell({
  revealedPin,
  onReveal,
  onHide,
  onReset,
}: {
  revealedPin?: string;
  onReveal: () => void;
  onHide: () => void;
  onReset: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      {revealedPin ? (
        <>
          <button
            type="button"
            className="font-mono text-sm tracking-widest"
            onClick={async () => {
              await navigator.clipboard.writeText(revealedPin);
              toast.success("PIN copied");
            }}
            title="Click to copy"
          >
            {revealedPin}
          </button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onHide}>
            <EyeOff className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onReveal}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Reset PIN"
          onClick={() => setConfirmOpen(true)}
        >
          <KeyRound className="h-3.5 w-3.5" />
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset PIN?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This generates a new 4-digit PIN for this volunteer. Their old PIN
            will stop working immediately.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onReset();
                setConfirmOpen(false);
              }}
            >
              Reset PIN
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
