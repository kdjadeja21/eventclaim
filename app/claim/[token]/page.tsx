import { notFound } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Gift,
} from "lucide-react";
import { getClaimPageData } from "./claim-actions";
import CopyCode from "./copy-code";
import RedeemButton from "./redeem-button";
import LogoImage from "./logo-image";
import SurpriseReveal from "./surprise-reveal";

type Props = { params: Promise<{ token: string }> };

export default async function ClaimPage({ params }: Props) {
  const { token } = await params;
  const data = await getClaimPageData(token);

  if (!data.found) {
    notFound();
  }

  const { attendee, event, grants } = data;
  const activeGrants = grants.filter((g) => !g.coupon.isDisabled);
  const claimedCount = activeGrants.filter((g) => g.status === "claimed").length;
  const attendeeFirstName = attendee.name?.trim().split(" ")[0] ?? "there";

  return (
    <div className="relative min-h-screen bg-[#fafafa] text-zinc-900 selection:bg-zinc-200">
      {/* Subtle fading grid background */}
      <div className="pointer-events-none absolute inset-0 z-0 flex justify-center overflow-hidden">
        <div className="h-full w-full bg-[linear-gradient(to_right,#e5e5e5_1px,transparent_1px),linear-gradient(to_bottom,#e5e5e5_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12 sm:py-20">
        {/* Header / Hero */}
        <div className="mb-16 max-w-3xl">
          <a
            href="https://cursor.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mb-10 inline-flex items-center"
            aria-label="Cursor"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://timer21.vercel.app/cursor_logo.svg"
              alt="Cursor"
              className="h-10 sm:h-12 w-auto [filter:brightness(0)] hover:opacity-80 transition-opacity"
            />
          </a>

          <h1 className="mb-6 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl sm:leading-tight">
            {event.tagline ?? "Build together, claim your credits."}
          </h1>

          <p className="mb-10 text-base leading-relaxed text-zinc-500 sm:text-lg max-w-2xl">
            {event.description ??
              "A morning of building with fellow developers. Bring your laptop, grab a coffee, and walk away with free credits from our partners to power your next project."}
          </p>

          <div className="flex flex-wrap gap-4">
            <InfoPill
              icon={Calendar}
              label="Date"
              value={formatDate(event.date)}
            />
            {event.timeLabel && (
              <InfoPill icon={Clock} label="Time" value={event.timeLabel} />
            )}
            {event.venue && (
              <InfoPill icon={MapPin} label="Venue" value={event.venue} />
            )}
          </div>

          <SurpriseReveal attendeeFirstName={attendeeFirstName} token={token} />
        </div>

        {/* Offers Section */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="mb-2 text-2xl font-bold tracking-tight text-zinc-900">
              Partner offers
            </h2>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Our partners are giving attendees free credits and trials. Here&apos;s everything you can claim on the day.
            </p>
          </div>
          {activeGrants.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 shadow-sm">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {claimedCount}/{activeGrants.length} claimed
            </span>
          )}
        </div>

        <div className="mb-8 rounded-xl border border-zinc-200 bg-zinc-50/50 px-5 py-4 text-sm text-zinc-600">
          <strong className="text-zinc-900">Heads up:</strong> all credits and promo codes are limited in quantity and offered on a first-come, first-served basis. Redeem early to avoid missing out.
        </div>

        {activeGrants.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center text-sm text-zinc-500 shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-zinc-300" />
            No partner offers are available at this time.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {activeGrants.map((g) => (
              <OfferCard
                key={g.couponId}
                grant={g}
                token={token}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Offer Card ───────────────────────────────────────────────────────────────

function OfferCard({
  grant,
  token,
}: {
  grant: {
    couponId: string;
    value: string;
    status: "assigned" | "claimed";
    coupon: {
      name: string;
      kind: "uniqueLink" | "sharedCode" | "sharedLink";
      category: string;
      logoUrl: string;
      highlight: string;
      description: string;
      note?: string;
      redeemUrl?: string;
    };
  };
  token: string;
}) {
  const { coupon, value, status, couponId } = grant;
  const claimed = status === "claimed";

  return (
    <div className="group flex h-full flex-col rounded-[20px] border border-zinc-200 bg-white p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {coupon.logoUrl ? (
            <LogoImage src={coupon.logoUrl} alt={coupon.name} />
          ) : (
            <span className="text-lg font-bold tracking-tight text-zinc-900">{coupon.name}</span>
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

      {coupon.category && (
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
          {coupon.category}
        </p>
      )}

      <div className="mb-4 flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3.5">
        <Gift className="h-4 w-4 shrink-0 text-zinc-400" />
        <span className="text-sm font-bold text-zinc-900">
          {coupon.highlight}
        </span>
      </div>

      <p className="mb-6 flex-1 text-[15px] leading-relaxed text-zinc-500">
        {coupon.description}
      </p>

      {coupon.note && (
        <div className="mb-6 rounded-xl border border-amber-100/50 bg-amber-50/50 px-4 py-3.5 text-[13px] leading-relaxed text-amber-800">
          <span className="font-bold text-amber-900">Note: </span>
          {coupon.note}
        </div>
      )}

      {coupon.redeemUrl && (
        <div className="mb-6">
          <a
            href={coupon.redeemUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-[13px] font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            How to redeem →
          </a>
        </div>
      )}

      <div className="mt-auto">
        {coupon.kind === "sharedCode" ? (
          <CopyCode code={value} token={token} couponId={couponId} />
        ) : (
          <RedeemButton
            href={`/claim/${encodeURIComponent(token)}/redeem/${encodeURIComponent(couponId)}`}
            label={claimed ? "Offer redeemed" : "Redeem offer"}
            isClaimed={claimed}
          />
        )}
      </div>
    </div>
  );
}

function InfoPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-colors hover:border-zinc-300">
      <Icon className="h-4 w-4 shrink-0 text-zinc-400" />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
          {label}
        </p>
        <p className="text-sm font-bold text-zinc-900">{value}</p>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
