"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAppSettings } from "@/lib/use-app-settings";
import type { DashboardData } from "@/app/api/dashboard/route";
import {
  deriveTourProgress,
  type ChecklistStep,
  type TourProgress,
} from "@/lib/tour/progress";
import {
  hasSeenTour,
  isChecklistDismissed,
  markTourSeen,
  setChecklistDismissed,
  setLastEventSlug,
  subscribeTourStorage,
} from "@/lib/tour/storage";
import { destroyTour, startOrientationTour } from "@/components/tour/run-tour";
import WelcomeDialog from "@/components/tour/welcome-dialog";

type TourContextValue = {
  progress: TourProgress;
  checklistVisible: boolean;
  startTour: () => void;
  dismissChecklist: () => void;
  steps: ChecklistStep[];
};

const TourContext = createContext<TourContextValue | null>(null);

function useTourSeen(): boolean {
  return useSyncExternalStore(subscribeTourStorage, hasSeenTour, () => true);
}

function useChecklistDismissedFlag(): boolean {
  return useSyncExternalStore(
    subscribeTourStorage,
    isChecklistDismissed,
    () => true
  );
}

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { emailConfigured, lumaConfigured, loading: settingsLoading } =
    useAppSettings();

  const tourSeen = useTourSeen();
  const checklistDismissed = useChecklistDismissedFlag();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as DashboardData;
        if (cancelled) return;
        setDashboard(data);
      } catch {
        // Checklist stays best-effort if dashboard is unavailable.
      }
    }

    void loadProgress();
    const interval = window.setInterval(loadProgress, 30_000);
    const onFocus = () => {
      void loadProgress();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, emailConfigured]);

  const progress = useMemo(
    () =>
      deriveTourProgress({
        emailConfigured,
        lumaConfigured,
        dashboard,
      }),
    [emailConfigured, lumaConfigured, dashboard]
  );

  useEffect(() => {
    if (progress.firstDraftEventSlug || progress.firstEventSlug) {
      setLastEventSlug(
        progress.firstDraftEventSlug ?? progress.firstEventSlug
      );
    }
  }, [progress.firstDraftEventSlug, progress.firstEventSlug]);

  useEffect(() => {
    return () => {
      destroyTour();
    };
  }, []);

  useEffect(() => {
    destroyTour();
  }, [pathname]);

  const startTour = useCallback(() => {
    markTourSeen();
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        startOrientationTour({
          onDestroyed: () => {
            markTourSeen();
          },
        });
      }, 80);
    });
  }, []);

  const skipWelcome = useCallback(() => {
    markTourSeen();
  }, []);

  const dismissChecklist = useCallback(() => {
    setChecklistDismissed(true);
  }, []);

  const checklistVisible = !checklistDismissed && !settingsLoading;

  const value = useMemo<TourContextValue>(
    () => ({
      progress,
      checklistVisible,
      startTour,
      dismissChecklist,
      steps: progress.steps,
    }),
    [progress, checklistVisible, startTour, dismissChecklist]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <WelcomeDialog
        open={!tourSeen}
        onStartTour={startTour}
        onSkip={skipWelcome}
      />
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error("useTour must be used within TourProvider");
  }
  return ctx;
}
