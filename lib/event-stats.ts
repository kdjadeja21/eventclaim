import { adminDb } from "@/lib/firebase/admin";
import { EventStats } from "@/lib/types";

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
    totalCouponsSnap,
    assignedSnap,
    sentSnap,
    pendingSnap,
    failedSnap,
    claimedSnap,
    availableSnap,
  ] = await Promise.all([
    attendeesRef.count().get(),
    couponsRef.count().get(),
    attendeesRef.where("couponId", "!=", null).count().get(),
    attendeesRef.where("emailStatus", "==", "sent").count().get(),
    attendeesRef.where("emailStatus", "==", "pending").count().get(),
    attendeesRef.where("emailStatus", "==", "failed").count().get(),
    attendeesRef.where("claimed", "==", true).count().get(),
    couponsRef.where("status", "==", "available").count().get(),
  ]);

  const totalAttendees = totalAttendeesSnap.data().count;
  const totalCoupons = totalCouponsSnap.data().count;
  const totalAssigned = assignedSnap.data().count;
  const totalEmailsSent = sentSnap.data().count;
  const totalEmailsPending = pendingSnap.data().count;
  const totalEmailsFailed = failedSnap.data().count;
  const totalClaimed = claimedSnap.data().count;
  const totalAvailable = availableSnap.data().count;
  const totalUnclaimed = totalAssigned - totalClaimed;
  const claimRate =
    totalAssigned > 0 ? (totalClaimed / totalAssigned) * 100 : 0;

  return {
    totalAttendees,
    totalCoupons,
    totalAssigned,
    totalAvailable,
    totalEmailsSent,
    totalEmailsPending,
    totalEmailsFailed,
    totalClaimed,
    totalUnclaimed,
    claimRate,
  };
}
