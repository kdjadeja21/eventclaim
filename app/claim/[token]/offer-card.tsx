"use client";

import { CheckCircle2, Copy, ExternalLink, Gift } from "lucide-react";
import { CouponKind } from "@/lib/types";
import CopyCode from "./copy-code";
import RedeemButton from "./redeem-button";
import LogoImage from "./logo-image";

export type PartnerOfferCardData = {
  name: string;
  kind: CouponKind;
  category: string;
  logoUrl: string;
  highlight: string;
  description: string;
  note?: string;
  redeemUrl?: string;
  /** Display value for sharedCode / sharedLink preview or live grant */
  value?: string;
};

type LiveProps = {
  preview?: false;
  couponId: string;
  token: string;
  status: "assigned" | "claimed";
  offer: PartnerOfferCardData;
};

type PreviewProps = {
  preview: true;
  offer: PartnerOfferCardData;
  status?: "assigned" | "claimed";
};

export type PartnerOfferCardProps = LiveProps | PreviewProps;

export function PartnerOfferCard(props: PartnerOfferCardProps) {
  const preview = props.preview === true;
  const offer = props.offer;
  const status = props.status ?? "assigned";
  const claimed = status === "claimed";
  const value =
    offer.value?.trim() ||
    (offer.kind === "sharedCode" ? "SAMPLECODE" : "https://example.com/redeem");

  return (
    <div className="group flex h-full flex-col rounded-[20px] border border-zinc-200 bg-white p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {offer.logoUrl ? (
            <LogoImage src={offer.logoUrl} alt={offer.name || "Partner logo"} />
          ) : (
            <span className="text-lg font-bold tracking-tight text-zinc-900">
              {offer.name || "Partner name"}
            </span>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
            claimed
              ? "bg-green-100 text-green-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {claimed ? "Claimed" : "Available"}
        </span>
      </div>

      {offer.category && (
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
          {offer.category}
        </p>
      )}

      <div className="mb-4 flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3.5">
        <Gift className="h-4 w-4 shrink-0 text-zinc-400" />
        <span className="text-sm font-bold text-zinc-900">
          {offer.highlight || "Gift highlight"}
        </span>
      </div>

      <p className="mb-6 flex-1 text-[16px] leading-relaxed text-zinc-800">
        {offer.description || "Redemption instructions will appear here."}
      </p>

      {offer.note && (
        <div className="mb-6 rounded-xl border border-amber-200/60 bg-amber-50 px-4 py-3.5 text-[14px] leading-relaxed text-amber-900">
          <span className="font-bold">Note: </span>
          {offer.note}
        </div>
      )}

      {offer.redeemUrl && (
        <div className="mb-6">
          {preview ? (
            <span className="inline-flex items-center text-[14px] font-bold text-zinc-600">
              How to redeem →
            </span>
          ) : (
            <a
              href={offer.redeemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-[14px] font-bold text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              How to redeem →
            </a>
          )}
        </div>
      )}

      <div className="mt-auto">
        {preview ? (
          <PreviewCta kind={offer.kind} value={value} claimed={claimed} />
        ) : offer.kind === "sharedCode" ? (
          <CopyCode
            code={value}
            token={(props as LiveProps).token}
            couponId={(props as LiveProps).couponId}
          />
        ) : (
          <RedeemButton
            href={`/claim/${encodeURIComponent((props as LiveProps).token)}/redeem/${encodeURIComponent((props as LiveProps).couponId)}`}
            label={claimed ? "Offer redeemed" : "Redeem offer"}
            isClaimed={claimed}
          />
        )}
      </div>
    </div>
  );
}

function PreviewCta({
  kind,
  value,
  claimed,
}: {
  kind: CouponKind;
  value: string;
  claimed: boolean;
}) {
  if (kind === "sharedCode") {
    return (
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
          Use code at checkout
        </p>
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 p-1.5">
          <span className="flex-1 px-3 font-mono text-sm font-bold tracking-wider text-zinc-800">
            {value}
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400">
            <Copy className="h-4 w-4" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        claimed
          ? "flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-3.5 text-sm font-bold text-zinc-600 shadow-sm"
          : "flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-bold text-white shadow-sm ring-1 ring-inset ring-zinc-900"
      }
    >
      {claimed ? (
        <CheckCircle2 className="h-4 w-4 text-green-600" />
      ) : (
        <ExternalLink className="h-4 w-4 opacity-70" />
      )}
      <span>{claimed ? "Offer redeemed" : "Redeem offer"}</span>
    </div>
  );
}
