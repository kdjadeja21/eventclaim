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
import WatchDemoDialog from "@/components/watch-demo-dialog";
import { BrandMarkIcon } from "@/components/brand-mark";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/audit", label: "Audit logs", icon: ClipboardList },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function AdminNav({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="w-60 flex flex-col border-r border-sidebar-border bg-sidebar h-full">
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border">
        <BrandMarkIcon size="sm" className="text-sidebar-foreground" />
        <div className="min-w-0">
          <p className="font-semibold text-sm text-sidebar-foreground leading-none">
            Cursor Community
          </p>
          <p className="text-xs text-sidebar-foreground/60 mt-0.5 truncate">
            {userEmail ?? "Admin"}
          </p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ease-[var(--ease-out-spring)]",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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

      <div className="p-3">
        <Separator className="mb-3 bg-sidebar-border" />
        <div className="space-y-1">
          <WatchDemoDialog variant="sidebar" />
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </aside>
  );
}
