import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "@/components/tour/tour-styles.css";
import {
  FEATURE_TOUR_STEPS,
  buildTourPath,
  pathMatchesTourRoute,
  type FeatureTourContext,
  type FeatureTourStep,
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

/** Fully stop the feature tour (user closed it or finished). */
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

function visibleSteps(): FeatureTourStep[] {
  return FEATURE_TOUR_STEPS;
}

async function showStepAt(index: number): Promise<void> {
  const steps = visibleSteps();
  if (index < 0 || index >= steps.length) {
    endFeatureTour();
    return;
  }

  const step = steps[index];
  setActiveFeatureTour({ stepIndex: index });

  const targetPath = buildTourPath(step, tourContext);
  const onTarget = pathMatchesTourRoute(
    window.location.pathname,
    step,
    tourContext
  );

  if (!onTarget) {
    destroyTourHighlight();
    navigateHandler?.(targetPath);
    return;
  }

  // Apply hash without another navigation if needed.
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
  // Each spotlight is a 1-step driver.js tour, so the library always thinks it
  // is on the final step and prefers doneBtnText. Force the label on the
  // popover itself (spreads after driver.js's auto last-step override).
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

/** Start the feature tour from the beginning. */
export function startFeatureTour(): void {
  clearResumeTimer();
  destroyTourHighlight();
  setActiveFeatureTour({ stepIndex: 0 });
  void showStepAt(0);
}

/**
 * Resume after a client navigation. Call when pathname changes while a tour
 * is active — does not wipe the active tour (unlike a full destroy).
 */
export function resumeFeatureTourIfNeeded(pathname: string): void {
  const active = getActiveFeatureTour();
  if (!active) return;

  clearResumeTimer();
  // Let the new page paint, then spotlight.
  resumeTimer = window.setTimeout(() => {
    const steps = visibleSteps();
    const index = Math.min(active.stepIndex, steps.length - 1);
    const step = steps[index];
    if (!step) {
      endFeatureTour();
      return;
    }
    if (!pathMatchesTourRoute(pathname, step, tourContext)) {
      // Context may have gained an event slug; re-navigate to the resolved route.
      navigateHandler?.(buildTourPath(step, tourContext));
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
  startFeatureTour();
  // Preserve old callback timing loosely: fire when tour ends via storage clear is not hooked;
  // callers now use markTourSeen at start.
  options?.onDestroyed?.();
}

export function destroyTour(): void {
  // Only clear the highlight overlay — keep active tour so route changes can resume.
  // Use endFeatureTour() to fully stop.
  destroyTourHighlight();
}
