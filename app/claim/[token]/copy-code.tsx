"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
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
    // Mark the grant as claimed on copy
    await markGrantClaimed(token, couponId);
  }

  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">
        Use code at checkout
      </p>
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 p-1.5 transition-colors focus-within:border-zinc-300 focus-within:bg-white hover:border-zinc-300 hover:bg-white">
        <span className="flex-1 px-3 font-mono text-sm font-bold tracking-wider text-zinc-800">
          {code}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 shadow-sm transition-all hover:bg-zinc-50 active:scale-95"
          aria-label="Copy code"
          title="Copy code"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
