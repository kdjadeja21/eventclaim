"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, Link2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function PublicClaimLink({ slug }: { slug: string }) {
  const path = `/claim/e/${slug}`;
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const fullUrl =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Public claim link
        </CardTitle>
        <CardDescription className="text-xs">
          Share this link so attendees can look up their offers by email —
          without waiting for the claim email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-1.5">
          <span className="flex-1 truncate px-2 font-mono text-xs text-muted-foreground">
            {path}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm transition-all hover:bg-accent active:scale-95"
            aria-label="Copy public claim link"
            title="Copy link"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <a
            href={path}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm transition-all hover:bg-accent active:scale-95"
            aria-label="Open public claim link"
            title="Open link"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
