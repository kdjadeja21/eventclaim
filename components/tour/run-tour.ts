import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "@/components/tour/tour-styles.css";
import {
  getTourSteps,
  buildTourPath,
  pathMatchesTourRoute,
  type FeatureTourContext,
  type TourId,
} from "@/lib/tour/steps";
import {
  getActiveFeatureTour,
  setActiveFeatureTour,
} from "@/lib/tour/storage";

let activeDriver: Driver | null = null;
let resumeTimer: number | null = null;
let navigateHandler: ((path: string) => void) | null = null;
let tourContext: FeatureTourContext = {
  draftEventSlug: null,
  eventSlug: null,
};
let activeTourId: TourId = "global";

function clearResumeTimer(): void {
  if (resumeTimer !== null) {
    window.clearTimeout(resumeTimer);
    resumeTimer = null;
  }
}

export function destroyTourHighlight(): void {
  if (activeDriver) {
    activeDriver.destroy();
    activeDriver = null;
  }
}

export function endFeatureTour(): void {
  clearResumeTimer();
  destroyTourHighlight();
  setActiveFeatureTour(null);
}

export function isTourHighlightActive(): boolean {
  return Boolean(activeDriver?.isActive());
}

function waitForElement(
  selector: string,
  timeoutMs = 2500
): Promise<Element | null> {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      } else if (Date.now() > deadline) {
        observer.disconnect();
        resolve(null);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeoutMs);
  });
}

async function showStepAt(index: number): Promise<void> {
  const steps = getTourSteps(activeTourId);
  if (index < 0 || index >= steps.length) {
    endFeatureTour();
    return;
  }

  const step = steps[index];
  setActiveFeatureTour({ tourId: activeTourId, stepIndex: index });

  const fallbackPath = window.location.pathname;
  const targetPath = buildTourPath(step, tourContext, fallbackPath);
  const onTarget = pathMatchesTourRoute(
    window.location.pathname,
    step,
    tourContext,
    fallbackPath
  );

  if (!onTarget) {
    destroyTourHighlight();
    navigateHandler?.(targetPath);
    return;
  }

  if (step.hash && window.location.hash !== step.hash) {
    window.location.hash = step.hash;
  }

  if (step.element) {
    await waitForElement(step.element);
  }

  destroyTourHighlight();

  const total = steps.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const primaryBtnText = isLast ? "Finish" : "Next";

  activeDriver = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayColor: "rgba(15, 23, 42, 0.55)",
    stagePadding: 8,
    stageRadius: 8,
    popoverClass: "eventclaim-tour-popover",
    nextBtnText: primaryBtnText,
    prevBtnText: "Back",
    doneBtnText: primaryBtnText,
    progressText: `Step ${index + 1} of ${total}`,
    onPopoverRender: (popover) => {
      popover.nextButton.innerHTML = primaryBtnText;
    },
    steps: [
      {
        element: step.element,
        skipMissingElement: true,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
          nextBtnText: primaryBtnText,
          doneBtnText: primaryBtnText,
          showButtons: ["next", "previous", "close"],
          onNextClick: (_el, _s, { driver: d }) => {
            d.destroy();
            activeDriver = null;
            if (isLast) {
              endFeatureTour();
              return;
            }
            void showStepAt(index + 1);
          },
          onPrevClick: (_el, _s, { driver: d }) => {
            d.destroy();
            activeDriver = null;
            if (!isFirst) {
              void showStepAt(index - 1);
            } else {
              void showStepAt(0);
            }
          },
          onCloseClick: (_el, _s, { driver: d }) => {
            d.destroy();
            activeDriver = null;
            endFeatureTour();
          },
        },
      },
    ],
    onDestroyed: () => {
      activeDriver = null;
    },
  });

  activeDriver.drive();
}

export function configureFeatureTour(options: {
  navigate: (path: string) => void;
  context: FeatureTourContext;
}): void {
  navigateHandler = options.navigate;
  tourContext = options.context;
}

export function startFeatureTour(tourId: TourId = "global"): void {
  clearResumeTimer();
  destroyTourHighlight();
  activeTourId = tourId;
  setActiveFeatureTour({ tourId, stepIndex: 0 });
  void showStepAt(0);
}

export function resumeFeatureTourIfNeeded(pathname: string): void {
  const active = getActiveFeatureTour();
  if (!active) return;

  activeTourId = active.tourId as TourId;
  clearResumeTimer();
  resumeTimer = window.setTimeout(() => {
    const steps = getTourSteps(activeTourId);
    const index = Math.min(active.stepIndex, Math.max(steps.length - 1, 0));
    const step = steps[index];
    if (!step) {
      endFeatureTour();
      return;
    }
    if (
      !pathMatchesTourRoute(pathname, step, tourContext, pathname)
    ) {
      navigateHandler?.(buildTourPath(step, tourContext, pathname));
      return;
    }
    void showStepAt(index);
  }, 120);
}

export function syncFeatureTourContext(context: FeatureTourContext): void {
  tourContext = context;
}

/** @deprecated use startFeatureTour */
export function startOrientationTour(options?: { onDestroyed?: () => void }): void {
  startFeatureTour("global");
  options?.onDestroyed?.();
}

export function destroyTour(): void {
  destroyTourHighlight();
}
