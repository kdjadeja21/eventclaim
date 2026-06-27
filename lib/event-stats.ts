import { adminDb } from "@/lib/firebase/admin";
import { EventStats, Attendee } from "@/lib/types";

export async function getEventCountStats(eventId: string): Promise<EventStats> {
  const attendeesRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees");

  const couponsRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("coupons");

  const [
    totalAttendeesSnap,
    couponDefsSnap,
    sentSnap,
    pendingSnap,
    failedSnap,
    claimedAnySnap,
    grantedSnap,
  ] = await Promise.all([
    attendeesRef.count().get(),
    couponsRef.count().get(),
    attendeesRef.where("emailStatus", "==", "sent").count().get(),
    attendeesRef.where("emailStatus", "==", "pending").count().get(),
    attendeesRef.where("emailStatus", "==", "failed").count().get(),
    attendeesRef.where("claimedAny", "==", true).count().get(),
    // Attendees who have >=1 grant
    attendeesRef.where("grantCount", ">", 0).count().get(),
  ]);

  const totalAttendees = totalAttendeesSnap.data().count;
  const totalCouponDefs = couponDefsSnap.data().count;
  const totalEmailsSent = sentSnap.data().count;
  const totalEmailsPending = pendingSnap.data().count;
  const totalEmailsFailed = failedSnap.data().count;
  const totalClaimed = claimedAnySnap.data().count;
  const totalGranted = grantedSnap.data().count;

  const claimRate =
    totalGranted > 0 ? (totalClaimed / totalGranted) * 100 : 0;

  return {
    totalAttendees,
    totalCouponDefs,
    totalGranted,
    totalEmailsSent,
    totalEmailsPending,
    totalEmailsFailed,
    totalClaimed,
    claimRate,
  };
}
