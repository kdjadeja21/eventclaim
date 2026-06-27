"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Trash2,
  Ban,
  CheckCircle,
  Edit,
  Link2,
  Code,
  ExternalLink,
  AlertTriangle,
  Gift,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { CouponWithStats, CouponKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponDisabled,
} from "./coupon-actions";

// ─── Types ─────────────────────────────────────────────────────────────────────

type DialogMode =
  | { type: "create" }
  | { type: "edit"; coupon: CouponWithStats }
  | { type: "delete"; coupon: CouponWithStats }
  | null;

type FormData = {
  name: string;
  kind: CouponKind;
  category: string;
  logoUrl: string;
  highlight: string;
  description: string;
  note: string;
  sharedValue: string;
  redeemUrl: string;
};

const EMPTY_FORM: FormData = {
  name: "",
  kind: "uniqueLink",
  category: "",
  logoUrl: "",
  highlight: "",
  description: "",
  note: "",
  sharedValue: "",
  redeemUrl: "",
};

// ─── Kind config ───────────────────────────────────────────────────────────────

const kindConfig: Record<CouponKind, { label: string; icon: React.ElementType; description: string }> = {
  uniqueLink: {
    label: "Unique Link",
    icon: Link2,
    description: "Each attendee gets a distinct single-use URL from a pool.",
  },
  sharedCode: {
    label: "Shared Code",
    icon: Code,
    description: "One promo code displayed to all attendees for use at checkout.",
  },
  sharedLink: {
    label: "Shared Link",
    icon: ExternalLink,
    description: "One URL shared with all attendees.",
  },
};

// ─── Main component ────────────────────────────────────────────────────────────

export default function CouponList({
  coupons: initial,
  eventId,
  eventSlug,
}: {
  coupons: CouponWithStats[];
  eventId: string;
  eventSlug: string;
}) {
  const [coupons, setCoupons] = useState(initial);
  // Keep local state in sync with refreshed server data (e.g. after router.refresh()
  // following a create), since useState ignores changes to its initial argument.
  useEffect(() => {
    setCoupons(initial);
  }, [initial]);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const router = useRouter();

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialog({ type: "create" });
  }

  function openEdit(coupon: CouponWithStats) {
    setForm({
      name: coupon.name,
      kind: coupon.kind,
      category: coupon.category,
      logoUrl: coupon.logoUrl,
      highlight: coupon.highlight,
      description: coupon.description,
      note: coupon.note ?? "",
      sharedValue: coupon.sharedValue ?? "",
      redeemUrl: coupon.redeemUrl ?? "",
    });
    setDialog({ type: "edit", coupon });
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Save create / edit ─────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);

    if (dialog?.type === "create") {
      const res = await createCoupon(eventId, form, eventSlug);
      setSaving(false);
      if (res.success) {
        toast.success("Coupon created and grants issued to existing attendees.");
        setDialog(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to create coupon.");
      }
    } else if (dialog?.type === "edit") {
      const res = await updateCoupon(eventId, dialog.coupon.id, form, eventSlug);
      setSaving(false);
      if (res.success) {
        toast.success("Coupon updated.");
        setDialog(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Failed to update coupon.");
      }
    }
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (dialog?.type !== "delete") return;
    setSaving(true);
    const res = await deleteCoupon(eventId, dialog.coupon.id, eventSlug);
    setSaving(false);
    if (res.success) {
      setCoupons((prev) => prev.filter((c) => c.id !== dialog.coupon.id));
      toast.success("Coupon deleted.");
      setDialog(null);
    } else {
      toast.error(res.error ?? "Delete failed.");
    }
  }

  // ─── Toggle disabled ────────────────────────────────────────────────────────

  function handleToggle(coupon: CouponWithStats) {
    startTransition(async () => {
      const res = await toggleCouponDisabled(
        eventId,
        coupon.id,
        !coupon.isDisabled,
        eventSlug
      );
      if (res.success) {
        setCoupons((prev) =>
          prev.map((c) =>
            c.id === coupon.id
              ? { ...c, isDisabled: !coupon.isDisabled }
              : c
          )
        );
        toast.success(coupon.isDisabled ? "Coupon enabled." : "Coupon disabled.");
        if (coupon.isDisabled) router.refresh(); // re-grant happened
      } else {
        toast.error(res.error ?? "Update failed.");
      }
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {coupons.length === 0
            ? "No partner offers yet."
            : `${coupons.length} offer${coupons.length !== 1 ? "s" : ""} · every eligible attendee receives all offers`}
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Offer
        </Button>
      </div>

      {/* Coupon cards */}
      {coupons.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          No partner offers added yet. Click &ldquo;New Offer&rdquo; to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {coupons.map((coupon) => {
            const KindIcon = kindConfig[coupon.kind].icon;
            const expanded = expandedIds.has(coupon.id);
            return (
              <Card
                key={coupon.id}
                className={cn("transition-opacity", coupon.isDisabled && "opacity-60")}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {/* Logo */}
                    {coupon.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coupon.logoUrl}
                        alt={coupon.name}
                        className={`h-8 w-8 rounded object-contain ${coupon.logoUrl.includes("cursor_logo.svg") ? "[filter:brightness(0)]" : ""}`}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                        <Gift className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{coupon.name}</span>
                        <Badge variant="outline" className="gap-1 text-xs font-normal">
                          <KindIcon className="h-3 w-3" />
                          {kindConfig[coupon.kind].label}
                        </Badge>
                        {coupon.category && (
                          <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            {coupon.category}
                          </span>
                        )}
                        {coupon.isDisabled && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <Ban className="h-3 w-3" />
                            Disabled
                          </Badge>
                        )}
                      </div>
                      {coupon.highlight && (
                        <p className="text-xs text-muted-foreground mt-0.5">{coupon.highlight}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" asChild title="View detail">
                        <Link href={`/events/${eventSlug}/coupons/${coupon.id}`}>
                          <Eye className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">View</span>
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleExpand(coupon.id)}
                        title="View stats"
                      >
                        <BarChart2 className="h-3.5 w-3.5" />
                        {expanded ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" title="More options">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(coupon)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggle(coupon)}>
                            {coupon.isDisabled ? (
                              <CheckCircle className="h-4 w-4 mr-2" />
                            ) : (
                              <Ban className="h-4 w-4 mr-2" />
                            )}
                            {coupon.isDisabled ? "Enable" : "Disable"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDialog({ type: "delete", coupon })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>

                {expanded && (
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/30 text-sm">
                      {coupon.kind === "uniqueLink" && (
                        <>
                          <Stat label="Pool Total" value={coupon.stats.total} />
                          <Stat label="Available" value={coupon.stats.available} />
                        </>
                      )}
                      <Stat label="Granted" value={coupon.stats.granted} />
                      <Stat label="Claimed" value={coupon.stats.claimed} />
                      <div className="col-span-2 sm:col-span-4">
                        <p className="text-xs text-muted-foreground mb-1">
                          Claim rate — {coupon.stats.claimRate.toFixed(0)}%
                        </p>
                        <Progress value={coupon.stats.claimRate} className="h-1.5" />
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={dialog?.type === "create" || dialog?.type === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === "create" ? "New Partner Offer" : "Edit Partner Offer"}
            </DialogTitle>
            <DialogDescription>
              Fill in the details below. These fields drive the attendee claim landing page.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Kind (only on create) */}
            {dialog?.type === "create" && (
              <div className="space-y-1.5">
                <Label>Coupon Type</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm((f) => ({ ...f, kind: v as CouponKind }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(kindConfig) as CouponKind[]).map((k) => {
                      const cfg = kindConfig[k];
                      const Icon = cfg.icon;
                      return (
                        <SelectItem key={k} value={k}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {cfg.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {kindConfig[form.kind].description}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cf-name">Vendor Name *</Label>
                <Input
                  id="cf-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Cursor Credits"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cf-category">Category</Label>
                <Input
                  id="cf-category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. AI EDITOR"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-logo">Logo URL</Label>
              <Input
                id="cf-logo"
                value={form.logoUrl}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                placeholder="https://example.com/logo.svg"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-highlight">Gift Highlight *</Label>
              <Input
                id="cf-highlight"
                value={form.highlight}
                onChange={(e) => setForm((f) => ({ ...f, highlight: e.target.value }))}
                placeholder="e.g. 3 months of Pro, comped"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-desc">Redemption Instructions *</Label>
              <Textarea
                id="cf-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Click the link, download the app, and open it…"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-note">Callout Note (optional)</Label>
              <Textarea
                id="cf-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Extra info shown in a highlighted box..."
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cf-redeem">How-to-Redeem Guide URL (optional)</Label>
              <Input
                id="cf-redeem"
                value={form.redeemUrl}
                onChange={(e) => setForm((f) => ({ ...f, redeemUrl: e.target.value }))}
                placeholder="https://notion.so/..."
              />
            </div>

            {/* Shared value fields */}
            {(form.kind === "sharedCode" || form.kind === "sharedLink") && (
              <div className="space-y-1.5">
                <Label htmlFor="cf-value">
                  {form.kind === "sharedCode" ? "Promo Code *" : "Shared URL *"}
                </Label>
                <Input
                  id="cf-value"
                  value={form.sharedValue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sharedValue: e.target.value }))
                  }
                  placeholder={
                    form.kind === "sharedCode"
                      ? "EXA50CURSOR"
                      : "https://example.com/offer"
                  }
                  className={form.kind === "sharedCode" ? "font-mono uppercase" : ""}
                />
              </div>
            )}

            {form.kind === "uniqueLink" && dialog?.type === "create" && (
              <p className="text-xs text-muted-foreground rounded-lg border p-3 bg-muted/30">
                You can paste unique links into the pool after creating the offer.
              </p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {dialog?.type === "create" ? "Create Offer" : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirm Dialog ────────────────────────────────────────────── */}
      <Dialog
        open={dialog?.type === "delete"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Delete Offer?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the coupon definition, all its links
              (if any), and all grants issued to attendees. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {dialog?.type === "delete" && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm font-medium">
              {dialog.coupon.name}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  );
}
