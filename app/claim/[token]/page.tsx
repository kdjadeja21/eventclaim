import { notFound } from "next/navigation";
import { Calendar, Clock, MapPin } from "lucide-react";
import { getClaimPageData } from "./claim-actions";
import SurpriseReveal from "./surprise-reveal";
import ClaimOffersSection from "./claim-offers-section";
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
        {/* Header / Hero — brand, headline, support, quiet meta */}
        <div className="mb-14 max-w-3xl">
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
              className="h-10 w-auto sm:h-12 [filter:brightness(0)]"
            />
          </a>

          <h1 className="mb-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl sm:leading-tight lg:text-6xl">
            {event.tagline ?? "Build together, claim your credits."}
          </h1>

          <p className="mb-8 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {event.description ??
              "A morning of building with fellow developers. Bring your laptop, grab a coffee, and walk away with free credits from our partners to power your next project."}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <InfoMeta
              icon={Calendar}
              label="Date"
              value={formatDate(event.date)}
            />
            {event.timeLabel && (
              <InfoMeta icon={Clock} label="Time" value={event.timeLabel} />
            )}
            {event.venue && (
              <InfoMeta icon={MapPin} label="Venue" value={event.venue} />
            )}
          </div>

          <SurpriseReveal attendeeFirstName={attendeeFirstName} token={token} />
        </div>

        <ClaimOffersSection
          token={token}
          claimedCount={claimedCount}
          grants={activeGrants.map((g) => ({
            couponId: g.couponId,
            status: g.status,
            offer: {
              name: g.coupon.name,
              kind: g.coupon.kind,
              category: g.coupon.category,
              logoUrl: g.coupon.logoUrl,
              highlight: g.coupon.highlight,
              description: g.coupon.description,
              note: g.coupon.note,
              redeemUrl: g.coupon.redeemUrl,
              value: g.value,
            },
          }))}
        />
      </div>

      <SiteCreditFooter tone="light" className="relative z-10" />
    </div>
  );
}

function InfoMeta({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      <span className="sr-only">{label}: </span>
      <span>{value}</span>
    </span>
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
