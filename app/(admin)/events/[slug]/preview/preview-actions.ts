"use server";

import { requireSession } from "@/lib/session";
import { resolveEventId } from "@/lib/db/repos/events";
import { listAttendeesForEvent } from "@/lib/db/repos/attendees";
import { listEnabledCouponsForEvent } from "@/lib/db/repos/coupons";

export async function getPreviewStats(slug: string) {
  await requireSession();

  const eventId = await resolveEventId(slug);

  const [attendees, enabledCoupons] = await Promise.all([
    listAttendeesForEvent(eventId),
    listEnabledCouponsForEvent(eventId),
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
  };
}
