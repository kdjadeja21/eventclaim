"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadCouponLogo } from "./coupon-actions";

export function LogoField({
  eventId,
  value,
  onChange,
}: {
  eventId: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(file: File | null) {
    if (!file) return;

    const formData = new FormData();
    formData.set("file", file);
    setUploading(true);
    const res = await uploadCouponLogo(eventId, formData);
    setUploading(false);

    if (res.success && res.url) {
      onChange(res.url);
      toast.success("Logo uploaded.");
    } else {
      toast.error(res.error ?? "Upload failed.");
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <Label>Logo</Label>
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted/40 overflow-hidden">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt="Logo preview"
              className={`max-h-full max-w-full object-contain p-1 ${
                value.includes("cursor_logo.svg") ? "[filter:brightness(0)]" : ""
              }`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <ImagePlus className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? "Uploading…" : "Upload image"}
            </Button>
            {value && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={uploading}
                onClick={() => onChange("")}
                title="Clear logo"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
          <Input
            id="cf-logo"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Or paste a public image URL"
            disabled={uploading}
          />
          <p className="text-xs text-muted-foreground">
            Upload PNG, JPG, WEBP, GIF, or SVG (max 2 MB), or paste a public URL.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
