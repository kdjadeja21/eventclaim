"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  limit: number;
  used: number;
  remaining: number;
  ok: boolean;
};

export default function EmailQuotaBadge({ limit, used, remaining, ok }: Props) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  if (!ok) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1.5">
          <Mail className="h-3 w-3" />
          Email quota unavailable
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh quota"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>
    );
  }

  const lowThreshold = Math.max(1, Math.floor(limit * 0.2));
  const variant =
    remaining === 0 ? "destructive" : remaining <= lowThreshold ? "warning" : "success";

  return (
    <div className="flex items-center gap-2">
      <Badge variant={variant} className="gap-1.5">
        <Mail className="h-3 w-3" />
        {remaining} / {limit} emails left this month
        <span className="font-normal opacity-80">({used} used)</span>
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleRefresh}
        disabled={isRefreshing}
        title="Refresh quota"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
