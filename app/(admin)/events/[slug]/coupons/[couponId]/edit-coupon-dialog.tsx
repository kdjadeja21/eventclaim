"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Edit } from "lucide-react";
import { Coupon, CouponKind } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateCoupon } from "../coupon-actions";
import { LogoField } from "../logo-field";

export function EditCouponDialog({
  eventId,
  eventSlug,
  couponId,
  coupon,
}: {
  eventId: string;
  eventSlug: string;
  couponId: string;
  coupon: Coupon;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const [form, setForm] = useState({
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

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);

    const res = await updateCoupon(eventId, couponId, form, eventSlug);
    setSaving(false);
    
    if (res.success) {
      toast.success("Coupon updated.");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Failed to update coupon.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-muted-foreground hover:text-foreground">
          <Edit className="h-3.5 w-3.5 mr-1" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Partner Offer</DialogTitle>
          <DialogDescription>
            Modify the details for this offer. These fields drive the attendee claim landing page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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

          <LogoField
            eventId={eventId}
            value={form.logoUrl}
            onChange={(logoUrl) => setForm((f) => ({ ...f, logoUrl }))}
          />

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
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Changes
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
