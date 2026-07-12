"use client";

import Link from "next/link";
import { BarChart2, ClipboardList, Users, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmationSection = "dashboard" | "volunteers" | "attendees" | "logs";

const sections: {
  key: ConfirmationSection;
  href: string;
  label: string;
  icon: React.ElementType;
}[] = [
  { key: "dashboard", href: "/confirmations", label: "Dashboard", icon: BarChart2 },
  { key: "volunteers", href: "/confirmations/volunteers", label: "Volunteers", icon: UserCog },
  { key: "attendees", href: "/confirmations/attendees", label: "Attendees", icon: Users },
  { key: "logs", href: "/confirmations/logs", label: "Logs", icon: ClipboardList },
];

export function ConfirmationSectionNav({ active }: { active: ConfirmationSection }) {
  return (
    <nav aria-label="Confirmation sections" className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        {sections.map(({ key, href, label, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={key === active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              key === active
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "border-border bg-background text-muted-foreground hover:bg-primary/5 hover:text-primary"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
