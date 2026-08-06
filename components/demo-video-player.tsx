"use client";

import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEMO_VIDEO_SRC = "/demo/eventclaim-portal-demo.mp4";
const DEMO_VTT_SRC = "/demo/eventclaim-portal-demo.vtt";

type Cue = { start: number; end: number; text: string };

function parseTimestamp(value: string): number {
  const parts = value.trim().split(":");
  if (parts.length === 3) {
    const [h, m, rest] = parts;
    const [s, ms = "0"] = rest.split(".");
    return (
      Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000
    );
  }
  const [m, rest] = parts;
  const [s, ms = "0"] = rest.split(".");
  return Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

function parseVtt(raw: string): Cue[] {
  const blocks = raw.replace(/\r/g, "").split(/\n\n+/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    if (!lines.length || lines[0] === "WEBVTT" || lines[0].startsWith("NOTE")) {
      continue;
    }
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim());
    const text = lines
      .slice(lines.indexOf(timeLine) + 1)
      .join(" ")
      .trim();
    if (!text) continue;
    cues.push({
      start: parseTimestamp(startRaw.split(" ")[0]),
      end: parseTimestamp(endRaw.split(" ")[0]),
      text,
    });
  }
  return cues;
}

export default function DemoVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [activeText, setActiveText] = useState("");
  const [captionsOn, setCaptionsOn] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(DEMO_VTT_SRC, { cache: "force-cache" });
        if (!res.ok) return;
        const raw = await res.text();
        if (!cancelled) setCues(parseVtt(raw));
      } catch {
        // Captions are optional — player still works without them.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !cues.length) return;

    function sync() {
      const t = video!.currentTime;
      const cue = cues.find((c) => t >= c.start && t < c.end);
      setActiveText(cue?.text ?? "");
    }

    sync();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("seeked", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("seeked", sync);
    };
  }, [cues]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full"
          controls
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          src={DEMO_VIDEO_SRC}
        >
          Your browser does not support embedded video.
        </video>

        {captionsOn && activeText ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-6">
            <p
              className={cn(
                "max-w-[90%] rounded-md bg-slate-950/75 px-3 py-1.5 text-center",
                "text-[13px] font-medium leading-snug tracking-tight text-slate-50",
                "shadow-sm backdrop-blur-[2px]"
              )}
            >
              {activeText}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <a
          href={DEMO_VIDEO_SRC}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Open video in new tab
        </a>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          onClick={() => setCaptionsOn((v) => !v)}
          aria-pressed={captionsOn}
        >
          {captionsOn ? (
            <Captions className="h-3.5 w-3.5" />
          ) : (
            <CaptionsOff className="h-3.5 w-3.5" />
          )}
          {captionsOn ? "Captions on" : "Captions off"}
        </Button>
      </div>
    </div>
  );
}
