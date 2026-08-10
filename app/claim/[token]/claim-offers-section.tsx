"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  PartnerOfferCard,
  type PartnerOfferCardData,
} from "./offer-card";
import { CLAIM_SURPRISE_EVENT } from "./surprise-reveal";

export type ClaimOfferGrant = {
  couponId: string;
  status: "assigned" | "claimed";
  offer: PartnerOfferCardData;
};

export default function ClaimOffersSection({
  token,
  grants,
  claimedCount,
}: {
  token: string;
  grants: ClaimOfferGrant[];
  claimedCount: number;
}) {
  const [stagger, setStagger] = useState(false);

  useEffect(() => {
    function onReveal(e: Event) {
      const detail = (e as CustomEvent<{ token: string }>).detail;
      if (detail?.token !== token) return;
      setStagger(true);
    }

    window.addEventListener(CLAIM_SURPRISE_EVENT, onReveal);
    return () => window.removeEventListener(CLAIM_SURPRISE_EVENT, onReveal);
  }, [token]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <h2 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
            Partner offers
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Our partners are giving attendees free credits and trials.
            Here&apos;s everything you can claim on the day.
          </p>
        </div>
        {grants.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {claimedCount}/{grants.length} claimed
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">Heads up:</strong> all
        credits and promo codes are limited in quantity and offered on a
        first-come, first-served basis. Redeem early to avoid missing out.
      </p>

      {grants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/60 px-6 py-14 text-left">
          <AlertCircle className="mb-4 h-8 w-8 text-muted-foreground/50" />
          <p className="text-base font-semibold text-foreground">
            No partner offers yet
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Offers for this event aren&apos;t available right now. Check back
            later, or ask your event organizer if you were expecting credits
            today.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {grants.map((g, index) => (
            <PartnerOfferCard
              key={g.couponId}
              couponId={g.couponId}
              token={token}
              status={g.status}
              offer={g.offer}
              className={stagger ? "claim-offer-enter" : undefined}
              style={
                stagger ? { animationDelay: `${index * 70}ms` } : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
