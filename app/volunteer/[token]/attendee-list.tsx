"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Phone, ChevronRight, Search, Crown, Users } from "lucide-react";
import {
  CONFIRMATION_STATUSES,
  CONFIRMATION_STATUS_LABELS,
  ConfirmationAttendee,
  ConfirmationStatus,
} from "@/lib/confirmation/types";
import { logoutVolunteer } from "./volunteer-actions";
import { AttendeeStatusDialog } from "./attendee-status-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const statusVariant: Record<
  ConfirmationStatus,
  "default" | "success" | "info" | "warning" | "destructive" | "secondary"
> = {
  need_confirmation: "secondary",
  call_pending: "info",
  call_done: "warning",
  confirm_coming: "success",
  not_coming: "destructive",
};

export function AttendeeList({
  token,
  volunteerName,
  attendees,
}: {
  token: string;
  volunteerName: string;
  attendees: ConfirmationAttendee[];
}) {
  const router = useRouter();
  const [localAttendees, setLocalAttendees] = useState(attendees);
  const [tab, setTab] = useState<"all" | ConfirmationStatus>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ConfirmationAttendee | null>(null);

  const counts = useMemo(() => {
    const base: Record<"all" | ConfirmationStatus, number> = {
      all: localAttendees.length,
      need_confirmation: 0,
      call_pending: 0,
      call_done: 0,
      confirm_coming: 0,
      not_coming: 0,
    };
    for (const a of localAttendees) base[a.status]++;
    return base;
  }, [localAttendees]);

  const filtered = useMemo(() => {
    let list = localAttendees;
    if (tab !== "all") list = list.filter((a) => a.status === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      );
    }
    return list;
  }, [localAttendees, tab, search]);

  async function handleLogout() {
    await logoutVolunteer();
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50/80">
      <div className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight gradient-text">
              Hi, {volunteerName}
            </h1>
            <p className="text-xs text-muted-foreground">
              {attendees.length} attendee{attendees.length !== 1 ? "s" : ""} assigned
              to you
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <TabButton active={tab === "all"} onClick={() => setTab("all")}>
            All ({counts.all})
          </TabButton>
          {CONFIRMATION_STATUSES.map((status) => (
            <TabButton
              key={status}
              active={tab === status}
              onClick={() => setTab(status)}
            >
              {CONFIRMATION_STATUS_LABELS[status]} ({counts[status]})
            </TabButton>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No attendees in this view.
              </CardContent>
            </Card>
          ) : (
            filtered.map((attendee) => (
              <button
                key={attendee.id}
                type="button"
                className="block w-full text-left"
                onClick={() => setSelected(attendee)}
              >
                <Card className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{attendee.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {attendee.email}
                      </p>
                      {attendee.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />
                          {attendee.phone}
                        </p>
                      )}
                      {attendee.teamRole && attendee.teamRole !== "individual" && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          {attendee.teamRole === "lead" ? (
                            <Crown className="h-3 w-3" />
                          ) : (
                            <Users className="h-3 w-3" />
                          )}
                          {attendee.teamRole === "lead" ? "Team Lead" : "Team Member"}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={statusVariant[attendee.status]} className="whitespace-nowrap">
                        {CONFIRMATION_STATUS_LABELS[attendee.status]}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            ))
          )}
        </div>
      </div>

      {selected && (
        <AttendeeStatusDialog
          key={selected.id}
          token={token}
          attendee={selected}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setLocalAttendees((prev) =>
              prev.map((a) => (a.id === updated.id ? updated : a))
            );
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? "gradient-brand text-white shadow-sm"
          : "bg-white border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
