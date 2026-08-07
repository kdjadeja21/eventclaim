"use client";

import { PlayCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import DemoVideoPlayer from "@/components/demo-video-player";
import { cn } from "@/lib/utils";

type WatchDemoDialogProps = {
  /** Visual style for the trigger button */
  variant?: "sidebar" | "header";
  className?: string;
};

export default function WatchDemoDialog({
  variant = "header",
  className,
}: WatchDemoDialogProps) {
  const isSidebar = variant === "sidebar";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant={isSidebar ? "ghost" : "outline"}
          size="sm"
          className={cn(
            isSidebar
              ? "w-full justify-start text-sidebar-foreground/70 hover:bg-white/10 hover:text-white"
              : "shrink-0 gap-1.5",
            className
          )}
        >
          <PlayCircle className={cn("h-4 w-4", isSidebar && "mr-2")} />
          Watch demo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>How to use this portal</DialogTitle>
          <DialogDescription>
            See how to use this portal — create events, import attendees, send
            claim emails, and track redemptions.
          </DialogDescription>
        </DialogHeader>
        <DemoVideoPlayer />
        <div className="relative overflow-hidden rounded-lg border border-primary/25 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 px-4 py-3.5 text-center shadow-sm">
          <div className="absolute inset-x-0 top-0 h-0.5 gradient-brand" />
          <p className="flex items-center justify-center gap-2 text-sm font-semibold tracking-wide text-primary">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            Fun fact
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground sm:text-base">
            The entire video — including audio and subtitles — was made using{" "}
            <span className="gradient-text font-bold">only Cursor</span>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
