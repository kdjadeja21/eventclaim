"use client";

import { useEffect, useState } from "react";
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
  Menu,
  X,
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

function NavBody({
  userEmail,
  onNavigate,
}: {
  userEmail?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-sidebar-border p-4">
        <BrandMarkIcon size="sm" className="text-sidebar-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-none text-sidebar-foreground">
            Cursor Community
          </p>
          <p className="mt-0.5 truncate text-xs text-sidebar-foreground/60">
            {userEmail ?? "Admin"}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ease-[var(--ease-out-spring)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
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
            className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </>
  );
}

export default function AdminNav({ userEmail }: { userEmail?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-3 border-b border-sidebar-border bg-sidebar px-3 md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-sidebar-ring"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <BrandMarkIcon size="sm" className="text-sidebar-foreground" />
        <span className="text-sm font-semibold text-sidebar-foreground">
          Cursor Community
        </span>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-foreground/40"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar shadow-lg">
            <NavBody
              userEmail={userEmail}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <NavBody userEmail={userEmail} />
      </aside>
    </>
  );
}
