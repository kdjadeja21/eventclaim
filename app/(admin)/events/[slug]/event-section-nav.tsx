"use client";

import Link from "next/link";
import { BarChart2, Ticket, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// "preview" kept for the preserved Preview & Send page (currently hidden site-wide).
type EventSection = "overview" | "import" | "attendees" | "coupons" | "preview";

const eventSections: {
  key: EventSection;
  href: (slug: string) => string;
  label: string;
  icon: React.ElementType;
  tourId?: string;
}[] = [
  {
    key: "overview",
    href: (slug) => `/events/${slug}`,
    label: "Overview",
    icon: BarChart2,
  },
  {
    key: "import",
    href: (slug) => `/events/${slug}/import`,
    label: "Import",
    icon: Upload,
    tourId: "event-nav-import",
  },
  {
    key: "attendees",
    href: (slug) => `/events/${slug}/attendees`,
    label: "Attendees",
    icon: Users,
    tourId: "event-nav-attendees",
  },
  {
    key: "coupons",
    href: (slug) => `/events/${slug}/coupons`,
    label: "Partner Offers",
    icon: Ticket,
    tourId: "event-nav-coupons",
  },
];

export function EventSectionNav({
  slug,
  active,
}: {
  slug: string;
  active: EventSection;
}) {
  if (!slug) return null;

  return (
    <nav aria-label="Event sections" className="overflow-x-auto pb-1" data-tour="event-section-nav">
      <div className="flex min-w-max gap-2">
        {eventSections.map(({ key, href, label, icon: Icon, tourId }) => (
          <Link
            key={key}
            href={href(slug)}
            data-tour={tourId}
            aria-current={key === active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              key === active
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "border-border bg-background text-muted-foreground hover:bg-primary/5 hover:text-primary"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
