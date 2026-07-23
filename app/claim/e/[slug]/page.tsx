import { notFound } from "next/navigation";
import { Calendar, Clock, MapPin, Gift } from "lucide-react";
import { getPublicEventBySlug } from "./actions";
import ClaimLookupForm from "./claim-lookup-form";

type Props = { params: Promise<{ slug: string }> };

export default async function EventClaimPage({ params }: Props) {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);

  if (!event) notFound();

  return (
    <div className="relative min-h-screen bg-[#fafafa] text-zinc-900 selection:bg-zinc-200">
      {/* Subtle fading grid background */}
      <div className="pointer-events-none absolute inset-0 z-0 flex justify-center overflow-hidden">
        <div className="h-full w-full bg-[linear-gradient(to_right,#e5e5e5_1px,transparent_1px),linear-gradient(to_bottom,#e5e5e5_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-12 sm:py-20">
        {/* Header / Hero */}
        <div className="mb-10">
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

          <h1 className="mb-6 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
            {event.tagline ?? "Claim your partner offers."}
          </h1>

          <p className="mb-8 text-base leading-relaxed text-zinc-500 sm:text-lg">
            {event.description ??
              "Enter the email you registered with to unlock the free credits and trials our partners are giving away."}
          </p>

          <div className="flex flex-wrap gap-4">
            <InfoPill icon={Calendar} label="Date" value={formatDate(event.date)} />
            {event.timeLabel && (
              <InfoPill icon={Clock} label="Time" value={event.timeLabel} />
            )}
            {event.venue && (
              <InfoPill icon={MapPin} label="Venue" value={event.venue} />
            )}
          </div>
        </div>

        {/* Lookup card */}
        <div className="rounded-[20px] border border-zinc-200 bg-white p-6 shadow-[0_2px_10px_rgba(0,0,0,0.02)] sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50">
              <Gift className="h-5 w-5 text-zinc-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-zinc-900">
                Find your offers
              </h2>
              <p className="text-sm text-zinc-500">
                For {event.name}
              </p>
            </div>
          </div>

          <ClaimLookupForm slug={slug} />
        </div>
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
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
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
