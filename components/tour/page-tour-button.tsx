"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/tour/tour-provider";
import type { TourId } from "@/lib/tour/steps";
import { cn } from "@/lib/utils";

export default function PageTourButton({
  tourId,
  className,
  label = "Tour this page",
}: {
  tourId: Exclude<TourId, "global">;
  className?: string;
  label?: string;
}) {
  const { startPageTour } = useTour();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("shrink-0 gap-1.5", className)}
      data-tour="page-tour-button"
      onClick={() => startPageTour(tourId)}
    >
      <HelpCircle className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
