"use client";

import { CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PartnerOfferCard,
  PartnerOfferCardData,
} from "@/app/claim/[token]/offer-card";

export function OfferPreviewDialog({
  open,
  onOpenChange,
  offer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: PartnerOfferCardData | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] max-w-2xl max-h-[90vh] overflow-y-auto border-0 bg-[#fafafa] p-0 sm:rounded-xl">
        {offer && (
          <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 z-0 flex justify-center overflow-hidden">
              <div className="h-full w-full bg-[linear-gradient(to_right,#e5e5e5_1px,transparent_1px),linear-gradient(to_bottom,#e5e5e5_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
            </div>

            <div className="relative z-10 px-6 pb-8 pt-6">
              <DialogHeader className="mb-6 space-y-1 text-left">
                <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900">
                  Claim page preview
                </DialogTitle>
                <DialogDescription className="text-sm text-zinc-500">
                  This is how the offer appears to attendees on the claim page.
                  Actions are disabled in preview.
                </DialogDescription>
              </DialogHeader>

              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-xl">
                  <h2 className="mb-2 text-2xl font-bold tracking-tight text-zinc-900">
                    Partner offers
                  </h2>
                  <p className="text-sm leading-relaxed text-zinc-500">
                    Our partners are giving attendees free credits and trials.
                    Here&apos;s everything you can claim on the day.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 shadow-sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  0/1 claimed
                </span>
              </div>

              <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50/50 px-5 py-4 text-sm text-zinc-600">
                <strong className="text-zinc-900">Heads up:</strong> all credits
                and promo codes are limited in quantity and offered on a
                first-come, first-served basis. Redeem early to avoid missing
                out.
              </div>

              <div className="mx-auto max-w-md">
                <PartnerOfferCard preview offer={offer} />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function toPreviewOffer(data: {
  name: string;
  kind: PartnerOfferCardData["kind"];
  category: string;
  logoUrl: string;
  highlight: string;
  description: string;
  note?: string;
  redeemUrl?: string;
  sharedValue?: string;
}): PartnerOfferCardData {
  return {
    name: data.name,
    kind: data.kind,
    category: data.category,
    logoUrl: data.logoUrl,
    highlight: data.highlight,
    description: data.description,
    note: data.note?.trim() ? data.note : undefined,
    redeemUrl: data.redeemUrl?.trim() ? data.redeemUrl : undefined,
    value: data.sharedValue,
  };
}
