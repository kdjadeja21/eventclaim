"use client";

import { CheckCircle2, Copy, ExternalLink, Gift } from "lucide-react";
import type { CSSProperties } from "react";
import { CouponKind } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  className?: string;
  style?: CSSProperties;
};

type PreviewProps = {
  preview: true;
  offer: PartnerOfferCardData;
  status?: "assigned" | "claimed";
  className?: string;
  style?: CSSProperties;
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
    <div
      className={cn(
        "group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-[border-color,background-color,opacity,transform] duration-300 ease-[var(--ease-out-spring)] hover:border-foreground/15 hover:bg-muted/30",
        props.className
      )}
      style={props.style}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {offer.logoUrl ? (
            <LogoImage src={offer.logoUrl} alt={offer.name || "Partner logo"} />
          ) : (
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {offer.name || "Partner name"}
            </span>
          )}
        </div>
        <Badge variant={claimed ? "success" : "secondary"} className="shrink-0">
          {claimed ? "Claimed" : "Available"}
        </Badge>
      </div>

      {offer.category && (
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {offer.category}
        </p>
      )}

      <div className="mb-4 flex items-center gap-3 rounded-md border border-border bg-muted/50 px-4 py-3.5">
        <Gift className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          {offer.highlight || "Gift highlight"}
        </span>
      </div>

      <p className="mb-6 flex-1 text-base leading-relaxed text-foreground/80">
        {offer.description || "Redemption instructions will appear here."}
      </p>

      {offer.note && (
        <div className="mb-6 rounded-md border border-amber-200/60 bg-amber-50 px-4 py-3.5 text-sm leading-relaxed text-amber-900">
          <span className="font-semibold">Note: </span>
          {offer.note}
        </div>
      )}

      {offer.redeemUrl && (
        <div className="mb-6">
          {preview ? (
            <span className="inline-flex items-center text-sm font-medium text-accent">
              How to redeem →
            </span>
          ) : (
            <a
              href={offer.redeemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm font-medium text-accent transition-opacity duration-200 ease-[var(--ease-out-spring)] hover:opacity-80"
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
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Use code at checkout
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-1.5">
          <span className="flex-1 px-3 font-mono text-sm font-semibold tracking-wider text-foreground">
            {value}
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground">
            <Copy className="h-4 w-4" />
          </span>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant={claimed ? "outline" : "default"}
      className="h-auto w-full py-3.5"
      disabled
      tabIndex={-1}
    >
      {claimed ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <ExternalLink className="h-4 w-4 opacity-70" />
      )}
      <span>{claimed ? "Offer redeemed" : "Redeem offer"}</span>
    </Button>
  );
}
