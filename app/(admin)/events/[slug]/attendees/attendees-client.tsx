"use client";

import { createContext, useContext, useState } from "react";
import type { EmailQuota } from "@/lib/email";
import { Attendee } from "@/lib/types";
import AttendeeTable from "./attendee-table";
import EmailQuotaBadge from "./email-quota-badge";

type QuotaContextValue = {
  quota: EmailQuota;
  setQuota: (quota: EmailQuota) => void;
};

const AttendeesQuotaContext = createContext<QuotaContextValue | null>(null);

function useAttendeesQuota() {
  const ctx = useContext(AttendeesQuotaContext);
  if (!ctx) {
    throw new Error("AttendeesQuota components must be used within AttendeesProvider");
  }
  return ctx;
}

type ProviderProps = {
  initialQuota: EmailQuota;
  children: React.ReactNode;
};

export function AttendeesProvider({ initialQuota, children }: ProviderProps) {
  const [quota, setQuota] = useState(initialQuota);

  return (
    <AttendeesQuotaContext.Provider value={{ quota, setQuota }}>
      {children}
    </AttendeesQuotaContext.Provider>
  );
}

export function AttendeesQuotaBadge() {
  const { quota, setQuota } = useAttendeesQuota();

  return (
    <EmailQuotaBadge
      limit={quota.limit}
      used={quota.used}
      remaining={quota.remaining}
      ok={quota.ok}
      onQuotaChange={setQuota}
    />
  );
}

type TableProps = {
  attendees: Attendee[];
  eventId: string;
  eventSlug: string;
  initialLumaLastSyncedAt?: string | null;
  lumaApiEnabled?: boolean;
};

export function AttendeesTable({
  attendees,
  eventId,
  eventSlug,
  initialLumaLastSyncedAt,
  lumaApiEnabled = false,
}: TableProps) {
  const { setQuota } = useAttendeesQuota();

  return (
    <AttendeeTable
      attendees={attendees}
      eventId={eventId}
      eventSlug={eventSlug}
      initialLumaLastSyncedAt={initialLumaLastSyncedAt}
      lumaApiEnabled={lumaApiEnabled}
      onQuotaChange={setQuota}
    />
  );
}
