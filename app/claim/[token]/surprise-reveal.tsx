"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Gift } from "lucide-react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";

export const CLAIM_SURPRISE_STORAGE_PREFIX = "claim-surprise-revealed:";
export const CLAIM_SURPRISE_EVENT = "claim-surprise-revealed";

function storageKey(token: string) {
  return `${CLAIM_SURPRISE_STORAGE_PREFIX}${token}`;
}

/** Brand confetti: ink, warm paper, muted neutrals, sparse orange */
const BRAND_CONFETTI_COLORS = [
  "#26251E",
  "#F7F7F4",
  "#F54E00",
  "#5A5852",
  "#A09C92",
  "#E6E5E0",
];

function subscribeSurprise(onStoreChange: () => void) {
  window.addEventListener(CLAIM_SURPRISE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(CLAIM_SURPRISE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function readRevealed(token: string): boolean {
  try {
    return localStorage.getItem(storageKey(token)) === "1";
  } catch {
    return false;
  }
}

export default function SurpriseReveal({
  attendeeFirstName,
  token,
}: {
  attendeeFirstName: string;
  token: string;
}) {
  const getSnapshot = useCallback(() => readRevealed(token), [token]);
  // SSR / pre-hydration: treat as revealed so returning visitors don't flash the overlay
  const revealed = useSyncExternalStore(subscribeSurprise, getSnapshot, () => true);

  function handleReveal() {
    try {
      localStorage.setItem(storageKey(token), "1");
    } catch {
      // ignore quota / private mode failures
    }
    window.dispatchEvent(
      new CustomEvent(CLAIM_SURPRISE_EVENT, { detail: { token } })
    );

    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = {
      startVelocity: 30,
      spread: 360,
      ticks: 60,
      zIndex: 100,
      colors: BRAND_CONFETTI_COLORS,
    };

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  }

  if (revealed) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/70 backdrop-blur-xl">
      <div className="claim-reveal-enter max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-lg bg-primary shadow-lg shadow-foreground/10">
            <Gift className="h-10 w-10 text-primary-foreground motion-safe:animate-bounce" />
          </div>
        </div>
        <h2 className="mb-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Hi {attendeeFirstName},
        </h2>
        <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
          You have an exclusive surprise waiting for you. Open your gift to
          reveal your partner offers.
        </p>
        <Button
          type="button"
          size="lg"
          onClick={handleReveal}
          className="group h-14 w-full gap-3 text-base"
        >
          <Gift className="h-5 w-5 text-primary-foreground/80 transition-transform duration-200 ease-[var(--ease-out-spring)] group-hover:-rotate-12" />
          Reveal my surprise
        </Button>
      </div>
    </div>
  );
}
