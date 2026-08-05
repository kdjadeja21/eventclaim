const TOUR_SEEN_KEY = "eventclaim_tour_seen_v1";
const CHECKLIST_DISMISSED_KEY = "eventclaim_checklist_dismissed_v1";
const LAST_EVENT_SLUG_KEY = "eventclaim_tour_last_event_slug_v1";
const ACTIVE_TOUR_KEY = "eventclaim_active_feature_tour_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readFlag(key: string): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  if (!isBrowser()) return;
  try {
    if (value) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage full / disabled — best-effort only.
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Subscribe to tour persistence changes (for useSyncExternalStore). */
export function subscribeTourStorage(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasSeenTour(): boolean {
  return readFlag(TOUR_SEEN_KEY);
}

export function markTourSeen(): void {
  writeFlag(TOUR_SEEN_KEY, true);
  emit();
}

export function isChecklistDismissed(): boolean {
  return readFlag(CHECKLIST_DISMISSED_KEY);
}

export function setChecklistDismissed(dismissed: boolean): void {
  writeFlag(CHECKLIST_DISMISSED_KEY, dismissed);
  emit();
}

export function getLastEventSlug(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(LAST_EVENT_SLUG_KEY);
  } catch {
    return null;
  }
}

export function setLastEventSlug(slug: string | null): void {
  if (!isBrowser()) return;
  try {
    if (slug) {
      window.localStorage.setItem(LAST_EVENT_SLUG_KEY, slug);
    } else {
      window.localStorage.removeItem(LAST_EVENT_SLUG_KEY);
    }
  } catch {
    // best-effort
  }
}

export type ActiveFeatureTour = {
  stepIndex: number;
};

export function getActiveFeatureTour(): ActiveFeatureTour | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_TOUR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveFeatureTour;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.stepIndex !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setActiveFeatureTour(tour: ActiveFeatureTour | null): void {
  if (!isBrowser()) return;
  try {
    if (!tour) {
      window.sessionStorage.removeItem(ACTIVE_TOUR_KEY);
    } else {
      window.sessionStorage.setItem(ACTIVE_TOUR_KEY, JSON.stringify(tour));
    }
    emit();
  } catch {
    // best-effort
  }
}

export function isFeatureTourActive(): boolean {
  return getActiveFeatureTour() !== null;
}
