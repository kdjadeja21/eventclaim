"use client";

import { useTransition } from "react";
import {
  Mail,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Info,
  ShieldCheck,
  Send,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { EmailQuota } from "@/lib/email";
import type { EmailConfig } from "@/lib/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { refreshEmailQuota } from "./email-actions";

type Props = {
  limit: number;
  used: number;
  remaining: number;
  ok: boolean;
  emailConfig: EmailConfig;
  onQuotaChange?: (quota: EmailQuota) => void;
  className?: string;
};

export default function EmailQuotaBadge({
  limit,
  used,
  remaining,
  ok,
  emailConfig,
  onQuotaChange,
  className = "",
}: Props) {
  const [isRefreshing, startTransition] = useTransition();

  function handleRefresh(e?: React.MouseEvent) {
    e?.stopPropagation();
    startTransition(async () => {
      try {
        const quota = await refreshEmailQuota(emailConfig);
        onQuotaChange?.(quota);
        toast.success("EmailJS quota refreshed", {
          description: `${quota.remaining} of ${quota.limit} emails remaining this month`,
        });
      } catch {
        toast.error("Failed to refresh EmailJS quota");
      }
    });
  }

  if (!ok) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`group flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-200 bg-amber-500 hover:bg-amber-600 border-amber-600 text-white shadow-sm cursor-pointer ${className}`}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>

            <Mail className="h-3.5 w-3.5 shrink-0 text-white" />
            <span className="font-semibold text-white">EmailJS Unconfigured</span>
            <ChevronDown className="h-3 w-3 text-white/80 group-hover:text-white transition-colors ml-0.5" />
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-88 p-4 space-y-4 shadow-xl border-amber-300 dark:border-amber-800">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h4 className="font-semibold text-sm">EmailJS Service</h4>
                <p className="text-xs text-muted-foreground">Status: Service Unconfigured</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            </Button>
          </div>

          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/50 p-3 text-xs text-amber-900 dark:text-amber-200 space-y-1.5 border border-amber-200 dark:border-amber-800">
            <p className="font-semibold flex items-center gap-1.5 text-amber-950 dark:text-amber-100">
              <Info className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" /> API Keys Missing
            </p>
            <p className="text-amber-900/90 dark:text-amber-300 leading-relaxed">
              To send emails via EmailJS, add your Service ID, Template ID, Public
              Key and Private Key on the{" "}
              <Link href="/settings" className="font-semibold underline">
                Settings
              </Link>{" "}
              page.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs font-medium gap-1.5"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Checking Status..." : "Re-check EmailJS Credentials"}
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  const usagePercent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const remainingPercent = 100 - usagePercent;

  const lowThreshold = Math.max(1, Math.floor(limit * 0.2));
  const isDepleted = remaining === 0;
  const isLow = !isDepleted && remaining <= lowThreshold;

  // Solid, opaque theme colors — avoids translucent backgrounds that muddy
  // when composited over dark page backgrounds, keeping contrast reliable
  // in both light and dark mode.
  const theme = isDepleted
    ? {
        statusText: "Depleted",
        badgeBg: "bg-rose-600 hover:bg-rose-700 border-rose-700",
        percentBadge: "bg-white/25 text-white border-white/30",
        pulseBg: "bg-white",
        pingBg: "bg-white",
        progressColor: "bg-rose-600 dark:bg-rose-500",
        iconColor: "text-rose-600 dark:text-rose-400",
        headerIconBg: "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300",
        StatusIcon: XCircle,
        message: "EmailJS monthly send quota has been completely used up. Automatic and manual emails will fail until quota resets.",
      }
    : isLow
    ? {
        statusText: "Low Quota Warning",
        badgeBg: "bg-amber-500 hover:bg-amber-600 border-amber-600",
        percentBadge: "bg-white/25 text-white border-white/30",
        pulseBg: "bg-white",
        pingBg: "bg-white",
        progressColor: "bg-amber-500 dark:bg-amber-400",
        iconColor: "text-amber-600 dark:text-amber-400",
        headerIconBg: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
        StatusIcon: AlertTriangle,
        message: `Less than 20% quota remaining (${remaining} emails left). Consider conserving sends for high-priority claims.`,
      }
    : {
        statusText: "Active & Healthy",
        badgeBg: "bg-emerald-600 hover:bg-emerald-700 border-emerald-700",
        percentBadge: "bg-white/25 text-white border-white/30",
        pulseBg: "bg-white",
        pingBg: "bg-white",
        progressColor: "bg-emerald-600 dark:bg-emerald-500",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        headerIconBg: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
        StatusIcon: CheckCircle2,
        message: "EmailJS service is healthy and operating within monthly quota limits.",
      };

  const { StatusIcon } = theme;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer ${theme.badgeBg} ${className}`}
        >
          {/* Status Dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${theme.pingBg}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${theme.pulseBg}`}></span>
          </span>

          {/* Mail Icon */}
          <Mail className="h-3.5 w-3.5 shrink-0 text-white" />

          {/* Text Count */}
          <span className="flex items-center gap-1.5">
            <span className="font-bold text-sm leading-none text-white">{remaining.toLocaleString()}</span>
            <span className="font-medium text-xs text-white/85">/ {limit.toLocaleString()} left</span>
          </span>

          {/* Percentage Tag */}
          <span className={`hidden sm:inline-flex items-center justify-center text-[11px] px-2 py-0.5 rounded-full font-mono font-bold border ${theme.percentBadge}`}>
            {remainingPercent}%
          </span>

          {/* Chevron */}
          <ChevronDown className="h-3.5 w-3.5 text-white/80 group-hover:text-white transition-colors ml-0.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-88 p-4 space-y-4 shadow-xl border-border/60">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${theme.headerIconBg}`}>
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h4 className="font-semibold text-sm leading-none">EmailJS Service</h4>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono text-muted-foreground">
                  v1.0 API
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <StatusIcon className={`h-3 w-3 ${theme.iconColor}`} />
                <span>{theme.statusText}</span>
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh quota"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
          </Button>
        </div>

        {/* Progress Meter */}
        <div className="space-y-2 bg-muted/40 dark:bg-muted/20 p-3 rounded-xl border border-border/40">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium flex items-center gap-1">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Monthly Delivery Quota
            </span>
            <span className="font-semibold font-mono text-xs">{used.toLocaleString()} / {limit.toLocaleString()} used</span>
          </div>

          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${theme.progressColor}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
            <span>{usagePercent}% Used</span>
            <span className="font-medium text-foreground">{remaining.toLocaleString()} Available</span>
          </div>
        </div>

        {/* Stat Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground">Monthly Cap</span>
            <span className="text-sm font-semibold font-mono mt-0.5">{limit.toLocaleString()}</span>
          </div>

          <div className="p-2.5 rounded-lg border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground">Used This Month</span>
            <span className="text-sm font-semibold font-mono mt-0.5">{used.toLocaleString()}</span>
          </div>

          <div className="p-2.5 rounded-lg border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground">Remaining</span>
            <span className="text-sm font-semibold font-mono mt-0.5 text-foreground">{remaining.toLocaleString()}</span>
          </div>

          <div className="p-2.5 rounded-lg border border-border/50 bg-card/60 flex flex-col">
            <span className="text-[11px] text-muted-foreground">Batch Concurrency</span>
            <span className="text-sm font-semibold font-mono mt-0.5 flex items-center gap-1 text-muted-foreground">
              <Send className="h-3 w-3 text-primary" />
              5 parallel
            </span>
          </div>
        </div>

        {/* Status / Notice Box */}
        <div className="rounded-xl border border-border/50 bg-muted/30 p-2.5 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <p className="leading-normal text-[11px]">
            {theme.message} Quota resets automatically on the 1st of every month (UTC).
          </p>
        </div>

        {/* Action Button */}
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs font-medium gap-1.5"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Syncing Quota..." : "Sync Latest Quota"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
