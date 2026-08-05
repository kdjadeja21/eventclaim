import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import "@/components/tour/tour-styles.css";
import { ORIENTATION_TOUR_STEPS } from "@/lib/tour/steps";

let activeDriver: Driver | null = null;

function toDriveSteps(): DriveStep[] {
  return ORIENTATION_TOUR_STEPS.map((step) => ({
    element: step.element,
    skipMissingElement: true,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side,
      align: step.align,
    },
  }));
}

export function destroyTour(): void {
  if (activeDriver) {
    activeDriver.destroy();
    activeDriver = null;
  }
}

export function startOrientationTour(options?: {
  onDestroyed?: () => void;
}): void {
  destroyTour();

  activeDriver = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayColor: "rgba(15, 23, 42, 0.55)",
    stagePadding: 8,
    stageRadius: 8,
    popoverClass: "eventclaim-tour-popover",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    progressText: "Step {{current}} of {{total}}",
    steps: toDriveSteps(),
    onDestroyed: () => {
      activeDriver = null;
      options?.onDestroyed?.();
    },
  });

  activeDriver.drive();
}

export function isTourActive(): boolean {
  return Boolean(activeDriver?.isActive());
}
