"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { EmailQuota } from "@/lib/email";
import { Attendee } from "@/lib/types";
import { useAppSettings } from "@/lib/use-app-settings";
import AttendeeTable from "./attendee-table";
import EmailQuotaBadge from "./email-quota-badge";
import { refreshEmailQuota } from "./email-actions";

const UNCONFIGURED_QUOTA: EmailQuota = {
  limit: 0,
  used: 0,
  remaining: 0,
  ok: false,
};

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
  children: React.ReactNode;
};

export function AttendeesProvider({ children }: ProviderProps) {
  const [quota, setQuota] = useState<EmailQuota>(UNCONFIGURED_QUOTA);
  const { loading, emailConfigured, emailConfig } = useAppSettings();

  // Fetch the real quota once settings have loaded from localStorage — the
  // server has no way to know the EmailJS config ahead of time.
  useEffect(() => {
    if (loading || !emailConfigured) return;
    let mounted = true;
    refreshEmailQuota(emailConfig).then((q) => {
      if (mounted) setQuota(q);
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, emailConfigured]);

  return (
    <AttendeesQuotaContext.Provider value={{ quota, setQuota }}>
      {children}
    </AttendeesQuotaContext.Provider>
  );
}

export function AttendeesQuotaBadge() {
  const { quota, setQuota } = useAttendeesQuota();
  const { emailConfig } = useAppSettings();

  return (
    <EmailQuotaBadge
      limit={quota.limit}
      used={quota.used}
      remaining={quota.remaining}
      ok={quota.ok}
      emailConfig={emailConfig}
      onQuotaChange={setQuota}
    />
  );
}

type TableProps = {
  attendees: Attendee[];
  eventId: string;
  eventSlug: string;
  initialLumaLastSyncedAt?: string | null;
};

export function AttendeesTable({
  attendees,
  eventId,
  eventSlug,
  initialLumaLastSyncedAt,
}: TableProps) {
  const { setQuota } = useAttendeesQuota();

  return (
    <AttendeeTable
      attendees={attendees}
      eventId={eventId}
      eventSlug={eventSlug}
      initialLumaLastSyncedAt={initialLumaLastSyncedAt}
      onQuotaChange={setQuota}
    />
  );
}
