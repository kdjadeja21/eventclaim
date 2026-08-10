import { notFound } from "next/navigation";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
} from "lucide-react";
import { getClaimPageData } from "./claim-actions";
import SurpriseReveal from "./surprise-reveal";
import { PartnerOfferCard } from "./offer-card";
import SiteCreditFooter from "@/components/site-credit-footer";

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
    <div className="relative min-h-screen bg-background text-foreground selection:bg-muted">
      {/* Subtle fading grid background */}
      <div className="pointer-events-none absolute inset-0 z-0 flex justify-center overflow-hidden">
        <div className="h-full w-full bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-12 sm:py-20">
        {/* Header / Hero */}
        <div className="mb-16 max-w-3xl">
          <a
            href="https://cursor.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mb-10 inline-flex items-center transition-opacity duration-200 ease-[var(--ease-out-spring)] hover:opacity-80"
            aria-label="Cursor"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/partner-logos/cursor_logo.svg"
              alt="Cursor"
              className="h-10 sm:h-12 w-auto [filter:brightness(0)]"
            />
          </a>

          <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl sm:leading-tight">
            {event.tagline ?? "Build together, claim your credits."}
          </h1>

          <p className="mb-10 text-base leading-relaxed text-muted-foreground sm:text-lg max-w-2xl">
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
            <h2 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
              Partner offers
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Our partners are giving attendees free credits and trials. Here&apos;s everything you can claim on the day.
            </p>
          </div>
          {activeGrants.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {claimedCount}/{activeGrants.length} claimed
            </span>
          )}
        </div>

        <div className="mb-8 rounded-lg border border-border bg-muted/50 px-5 py-4 text-sm text-muted-foreground">
          <strong className="text-foreground">Heads up:</strong> all credits and promo codes are limited in quantity and offered on a first-come, first-served basis. Redeem early to avoid missing out.
        </div>

        {activeGrants.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-12 text-left text-sm text-muted-foreground">
            <AlertCircle className="mb-4 h-8 w-8 text-muted-foreground/50" />
            No partner offers are available at this time.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {activeGrants.map((g) => (
              <PartnerOfferCard
                key={g.couponId}
                couponId={g.couponId}
                token={token}
                status={g.status}
                offer={{
                  name: g.coupon.name,
                  kind: g.coupon.kind,
                  category: g.coupon.category,
                  logoUrl: g.coupon.logoUrl,
                  highlight: g.coupon.highlight,
                  description: g.coupon.description,
                  note: g.coupon.note,
                  redeemUrl: g.coupon.redeemUrl,
                  value: g.value,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <SiteCreditFooter tone="light" className="relative z-10" />
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
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-3.5 transition-colors duration-200 ease-[var(--ease-out-spring)] hover:bg-muted/40">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
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
