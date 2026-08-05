"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ImagePlus, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { listPartnerLogos } from "./coupon-actions";

const INITIAL_VISIBLE = 5;

function logoPreviewClass(url: string) {
  return cn(
    "max-h-full max-w-full object-contain p-1",
    url.includes("cursor_logo.svg") && "[filter:brightness(0)]"
  );
}

function logoFileName(url: string) {
  if (!url) return "";
  const parts = url.split("/");
  return parts[parts.length - 1] || url;
}

export function LogoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [libraryLogos, setLibraryLogos] = useState<string[]>([]);
  const [loadingLogos, setLoadingLogos] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLogos() {
      setLoadingLogos(true);
      const logos = await listPartnerLogos();
      if (!cancelled) {
        setLibraryLogos(logos);
        setLoadingLogos(false);
      }
    }

    void loadLogos();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLogos = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return libraryLogos;

    return libraryLogos.filter((logoUrl) =>
      logoFileName(logoUrl).toLowerCase().includes(query)
    );
  }, [libraryLogos, search]);

  const visibleLogos = expanded
    ? filteredLogos
    : filteredLogos.slice(0, INITIAL_VISIBLE);

  const hiddenCount = Math.max(0, filteredLogos.length - INITIAL_VISIBLE);
  const showScroll = expanded && filteredLogos.length > INITIAL_VISIBLE;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border bg-muted/30 overflow-hidden">
            {value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value}
                alt="Logo preview"
                className={logoPreviewClass(value)}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <ImagePlus className="h-6 w-6 text-muted-foreground/40" />
            )}
          </div>

          <div className="flex-1 space-y-2">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Paste image URL or select below..."
              className="h-9"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Paste a public URL or pick from the library.
              </p>
              {value && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
                  onClick={() => onChange("")}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
        <div className="flex items-center justify-between gap-4">
          <Label className="text-xs text-muted-foreground">Library</Label>
          {libraryLogos.length > 0 && (
            <div className="relative flex-1 max-w-[200px]">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setExpanded(false);
                }}
                placeholder="Search logos..."
                className="h-7 pl-7 text-xs"
              />
            </div>
          )}
        </div>

        {loadingLogos ? (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading logos...
          </div>
        ) : libraryLogos.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs text-muted-foreground">No logos found.</p>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              Add images to <code className="rounded bg-muted px-1 py-0.5">public/partner-logos/</code>
            </p>
          </div>
        ) : filteredLogos.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No logos match &ldquo;{search}&rdquo;.
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className={cn(
                "grid grid-cols-5 gap-2",
                showScroll && "max-h-48 overflow-y-auto pr-1 scrollbar-thin"
              )}
            >
              {visibleLogos.map((logoUrl) => {
                const selected = value === logoUrl;

                return (
                  <button
                    key={logoUrl}
                    type="button"
                    title={logoFileName(logoUrl)}
                    aria-pressed={selected}
                    onClick={() => onChange(logoUrl)}
                    className={cn(
                      "relative flex h-12 items-center justify-center rounded-md border bg-background p-1.5 transition-all hover:border-primary/50",
                      selected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border/60 hover:bg-muted/50"
                    )}
                  >
                    {selected && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                        <Check className="h-2.5 w-2.5 stroke-[3]" />
                      </span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl}
                      alt={logoFileName(logoUrl)}
                      className={logoPreviewClass(logoUrl)}
                    />
                  </button>
                );
              })}
            </div>

            {hiddenCount > 0 && (
              <Button
                type="button"
                variant="secondary"
                className="h-7 w-full text-xs"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded ? "Show less" : `Show all (${hiddenCount} more)`}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
