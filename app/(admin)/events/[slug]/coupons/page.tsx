import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCoupons } from "./coupon-data-actions";
import { getEventBySlug } from "../../actions";
import { Button } from "@/components/ui/button";
import CouponList from "./coupon-list";
import { EventSectionNav } from "../event-section-nav";

type Props = { params: Promise<{ slug: string }> };

export default async function CouponsPage({ params }: Props) {
  const { slug } = await params;
  const [event, { coupons, eventId }] = await Promise.all([
    getEventBySlug(slug),
    getCoupons(slug),
  ]);

  if (!event) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/events/${slug}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Partner Offers
          </h1>
          <p className="text-sm text-muted-foreground">
            {event.name} &middot; {coupons.length} offer
            {coupons.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <EventSectionNav slug={slug} active="coupons" />

      <CouponList
        coupons={coupons}
        eventId={eventId}
        eventSlug={slug}
      />
    </div>
  );
}
