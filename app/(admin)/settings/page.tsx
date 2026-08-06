import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import SettingsClient from "./settings-client";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight gradient-text">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect Luma and EmailJS — credentials stay encrypted in this browser
            only.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link href="/settings/guide" target="_blank" rel="noopener noreferrer">
            <BookOpen className="h-4 w-4" />
            Setup guide
            <ExternalLink className="h-3 w-3 opacity-70" />
          </Link>
        </Button>
      </div>

      <SettingsClient />
    </div>
  );
}
