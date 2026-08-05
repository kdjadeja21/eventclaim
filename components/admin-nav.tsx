"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Wrench,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import GettingStarted from "@/components/tour/getting-started";
import { useTour } from "@/components/tour/tour-provider";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    tourId: "nav-dashboard",
  },
  {
    href: "/events",
    label: "Events",
    icon: CalendarDays,
    tourId: "nav-events",
  },
  {
    href: "/audit",
    label: "Audit Logs",
    icon: ClipboardList,
    tourId: null,
  },
  {
    href: "/tools",
    label: "Tools",
    icon: Wrench,
    tourId: null,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    tourId: "nav-settings",
  },
] as const;

export default function AdminNav({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { steps, progress, checklistVisible, startTour, dismissChecklist } =
    useTour();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="w-60 flex flex-col border-r border-sidebar-border bg-sidebar h-full">
      <div
        className="gradient-hero p-4 flex items-center gap-3 border-b border-white/10"
        data-tour="brand"
      >
        <div className="h-8 w-8 rounded-full gradient-brand flex items-center justify-center shrink-0 shadow-md">
          <span className="text-white font-bold text-sm">C</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm text-white leading-none">
            Cursor Community
          </p>
          <p className="text-xs text-white/60 mt-0.5 truncate">
            {userEmail ?? "Admin"}
          </p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, tourId }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              data-tour={tourId ?? undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
                active
                  ? "gradient-brand text-white shadow-md"
                  : "text-sidebar-foreground hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
              {active && (
                <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-70" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 space-y-3">
        <GettingStarted
          steps={steps}
          completedRequired={progress.completedRequired}
          totalRequired={progress.totalRequired}
          visible={checklistVisible}
          onDismiss={dismissChecklist}
          onReplayTour={startTour}
        />
        <Separator className="bg-sidebar-border" />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-white hover:bg-white/10"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
