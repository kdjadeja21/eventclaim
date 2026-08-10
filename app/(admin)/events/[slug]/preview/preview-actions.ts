"use server";

import { requireSession } from "@/lib/session";
import { resolveEventIdForUser } from "@/lib/db/repos/events";
import { listAttendeesForEvent } from "@/lib/db/repos/attendees";
import { listEnabledCouponsForEvent } from "@/lib/db/repos/coupons";
import { getEmailQuota, type EmailQuota } from "@/lib/email";
import type { EmailConfig } from "@/lib/settings";

export type PreviewStats = {
  eventId: string;
  totalAttendees: number;
  enabledCouponCount: number;
  attendeesWithGrants: number;
  attendeesWithoutGrants: number;
  poolExhausted: boolean;
  emailsToSend: number;
  emailsFailed: number;
  canSend: boolean;
  quota: EmailQuota;
};

export async function getPreviewStats(
  slug: string,
  emailConfig: EmailConfig
): Promise<PreviewStats> {
  const session = await requireSession();

  const eventId = await resolveEventIdForUser(slug, session.uid);

  const [attendees, enabledCoupons, quota] = await Promise.all([
    listAttendeesForEvent(eventId),
    listEnabledCouponsForEvent(eventId),
    getEmailQuota(emailConfig),
  ]);

  const enabledCouponCount = enabledCoupons.length;

  const uniqueLinkCoupons = enabledCoupons.filter((c) => c.kind === "uniqueLink");
  const poolExhausted = uniqueLinkCoupons.some((c) => (c.linkAvailable ?? 0) === 0);

  let emailsToSend = 0;
  let emailsFailed = 0;
  let attendeesWithGrants = 0;
  let attendeesWithoutGrants = 0;

  for (const a of attendees) {
    if (a.isBlacklisted) continue;
    if ((a.grantCount ?? 0) > 0) {
      attendeesWithGrants++;
      if (a.emailStatus === "pending") emailsToSend++;
      if (a.emailStatus === "failed") emailsFailed++;
    } else {
      attendeesWithoutGrants++;
    }
  }

  const totalAttendees = attendees.length;
  const canSend = attendeesWithoutGrants === 0 && enabledCouponCount > 0 && !poolExhausted;

  return {
    eventId,
    totalAttendees,
    enabledCouponCount,
    attendeesWithGrants,
    attendeesWithoutGrants,
    poolExhausted,
    emailsToSend,
    emailsFailed,
    canSend,
    quota,
  };
}
