"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import confetti from "canvas-confetti";

export default function SurpriseReveal({ attendeeFirstName }: { attendeeFirstName: string }) {
  const [revealed, setRevealed] = useState(false);

  function handleReveal() {
    setRevealed(true);
    
    // Play confetti
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults, particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults, particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
  }

  if (revealed) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/60 backdrop-blur-xl transition-opacity">
      <div className="animate-in fade-in zoom-in max-w-md p-8 text-center duration-700">
        <div className="mb-6 flex justify-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] bg-zinc-950 shadow-2xl shadow-zinc-900/20">
            <Gift className="animate-bounce h-10 w-10 text-white" />
          </div>
        </div>
        <h2 className="mb-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Hi {attendeeFirstName},
        </h2>
        <p className="mb-8 text-lg leading-relaxed text-zinc-500">
          You have an exclusive surprise waiting for you. Open your gift to reveal your partner offers.
        </p>
        <button
          onClick={handleReveal}
          className="group relative inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-zinc-950 px-8 text-base font-bold text-white shadow-xl shadow-zinc-900/10 transition-all hover:scale-105 hover:bg-zinc-800 active:scale-95"
        >
          <Gift className="h-5 w-5 text-zinc-300 transition-transform group-hover:-rotate-12" />
          Reveal My Surprise
        </button>
      </div>
    </div>
  );
}
