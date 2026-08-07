"use client";

import { useEffect, useRef, useState } from "react";
import {
  Captions,
  CaptionsOff,
  Maximize,
  Minimize,
  Pause,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEMO_VIDEO_SRC = "/demo/eventclaim-portal-demo.mp4";
const DEMO_VTT_SRC = "/demo/eventclaim-portal-demo.vtt";

type PlaybackFeedback = {
  kind: "play" | "pause";
  key: number;
};

function getFullscreenElement(): Element | null {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
  };
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

async function requestFullscreen(el: HTMLElement): Promise<void> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (el.requestFullscreen) {
    await el.requestFullscreen();
    return;
  }
  if (anyEl.webkitRequestFullscreen) {
    await anyEl.webkitRequestFullscreen();
  }
}

async function exitFullscreen(): Promise<void> {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }
  if (doc.webkitExitFullscreen) {
    await doc.webkitExitFullscreen();
  }
}

/**
 * Demo player uses the browser-native WebVTT track so captions stay in sync
 * with audio and remain visible in fullscreen (custom overlays disappear when
 * only the <video> element is fullscreened).
 */
export default function DemoVideoPlayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLTrackElement>(null);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [feedback, setFeedback] = useState<PlaybackFeedback | null>(null);

  function flashPlaybackFeedback(kind: PlaybackFeedback["kind"]) {
    setFeedback((prev) => ({ kind, key: (prev?.key ?? 0) + 1 }));
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function applyMode() {
      const tracks = video!.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        // "showing" renders native cues; "hidden" keeps the track loaded but invisible.
        tracks[i].mode = captionsOn ? "showing" : "hidden";
      }
    }

    applyMode();
    video.addEventListener("loadedmetadata", applyMode);
    const trackEl = trackRef.current;
    trackEl?.addEventListener("load", applyMode);
    return () => {
      video.removeEventListener("loadedmetadata", applyMode);
      trackEl?.removeEventListener("load", applyMode);
    };
  }, [captionsOn]);

  useEffect(() => {
    function onFsChange() {
      const container = containerRef.current;
      setIsFullscreen(!!container && getFullscreenElement() === container);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);

  async function toggleFullscreen() {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (getFullscreenElement() === container) {
        await exitFullscreen();
      } else {
        await requestFullscreen(container);
      }
    } catch {
      // Browser may block fullscreen without a user gesture; ignore.
    }
  }

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden rounded-md bg-black",
          isFullscreen && "flex items-center justify-center bg-black"
        )}
      >
        <video
          ref={videoRef}
          className={cn(
            "demo-video-player aspect-video w-full",
            isFullscreen && "max-h-screen w-auto max-w-full"
          )}
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          src={DEMO_VIDEO_SRC}
          onContextMenu={(e) => e.preventDefault()}
          onPlay={() => flashPlaybackFeedback("play")}
          onPause={(e) => {
            // Ending the video also pauses; skip the flash so it doesn't feel like a user pause.
            if (e.currentTarget.ended) return;
            flashPlaybackFeedback("pause");
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            void toggleFullscreen();
          }}
        >
          <track
            ref={trackRef}
            kind="captions"
            srcLang="en"
            label="English"
            src={DEMO_VTT_SRC}
          />
          Your browser does not support embedded video.
        </video>

        {feedback ? (
          <div
            key={feedback.key}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            aria-hidden
          >
            <div
              className="demo-playback-feedback flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/10"
              onAnimationEnd={() =>
                setFeedback((current) =>
                  current?.key === feedback.key ? null : current
                )
              }
            >
              {feedback.kind === "play" ? (
                // ml-[3px] optically centers the play triangle in the circle
                <Play
                  className="ml-[3px] h-9 w-9 fill-white text-white"
                  strokeWidth={0}
                />
              ) : (
                <Pause className="h-9 w-9 fill-white text-white" strokeWidth={0} />
              )}
            </div>
          </div>
        ) : null}

        <style>{`
          .demo-video-player::cue {
            background-color: rgba(2, 6, 23, 0.82);
            color: #f8fafc;
            font-size: 1rem;
            font-weight: 500;
            line-height: 1.35;
          }

          @keyframes demo-playback-feedback {
            0% {
              opacity: 0;
              transform: scale(0.55);
            }
            14% {
              opacity: 1;
              transform: scale(1.05);
            }
            100% {
              opacity: 0;
              transform: scale(1.55);
            }
          }

          .demo-playback-feedback {
            animation: demo-playback-feedback 0.72s ease-out forwards;
          }

          @media (prefers-reduced-motion: reduce) {
            .demo-playback-feedback {
              animation: demo-playback-feedback-reduced 0.45s ease-out forwards;
            }
          }

          @keyframes demo-playback-feedback-reduced {
            0% { opacity: 0; }
            20% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>

      <div className="flex items-center justify-end gap-1">
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          onClick={() => void toggleFullscreen()}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? (
            <Minimize className="h-3.5 w-3.5" />
          ) : (
            <Maximize className="h-3.5 w-3.5" />
          )}
          {isFullscreen ? "Exit full screen" : "Full screen"}
        </Button>
      </div>
    </div>
  );
}
