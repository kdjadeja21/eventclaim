"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { markGrantClaimed } from "./claim-actions";

export default function CopyCode({
  code,
  token,
  couponId,
}: {
  code: string;
  token: string;
  couponId: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    await markGrantClaimed(token, couponId);
  }

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
        Use code at checkout
      </p>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border bg-muted/40 p-1.5 transition-[border-color,background-color,box-shadow] duration-200 ease-[var(--ease-out-spring)] focus-within:border-ring focus-within:bg-card hover:border-foreground/20 hover:bg-card",
          copied
            ? "border-accent shadow-[0_0_0_1px_hsl(var(--accent)/0.35)]"
            : "border-border"
        )}
      >
        <span className="flex-1 px-3 font-mono text-sm font-semibold tracking-wider text-foreground">
          {code}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-all duration-200 ease-[var(--ease-out-spring)] hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            copied && "border-accent/40 text-accent"
          )}
          aria-label="Copy code"
          title="Copy code"
        >
          {copied ? (
            <Check className="h-4 w-4 text-accent" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
