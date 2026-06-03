"use server";

import { adminDb } from "@/lib/firebase/admin";
import { writeAuditLog } from "@/lib/audit";
import { requireSession } from "@/lib/session";
import { Attendee } from "@/lib/types";
import { revalidatePath } from "next/cache";

async function deleteQueryInBatches(
  query: FirebaseFirestore.Query
): Promise<number> {
  let totalDeleted = 0;
  for (;;) {
    const snapshot = await query.limit(500).get();
    if (snapshot.empty) break;
    const batch = adminDb.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    totalDeleted += snapshot.size;
    if (snapshot.size < 500) break;
  }
  return totalDeleted;
}

export async function getAttendees(slug: string): Promise<{ attendees: Attendee[]; eventId: string }> {
  await requireSession();

  const eventSnap = await adminDb
    .collection("events")
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (eventSnap.empty) throw new Error("Event not found");

  const eventId = eventSnap.docs[0].id;

  const attendeesSnap = await adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .orderBy("createdAt", "desc")
    .get();

  return {
    attendees: attendeesSnap.docs.map((d) => d.data() as Attendee),
    eventId,
  };
}

export async function getAttendeeDetail(
  eventId: string,
  attendeeId: string
): Promise<{
  attendee: Attendee;
  emailLogs: Array<{
    id: string;
    emailType: string;
    sentAt: string;
    status: string;
  }>;
}> {
  await requireSession();

  const [attendeeSnap, logsSnap] = await Promise.all([
    adminDb
      .collection("events")
      .doc(eventId)
      .collection("attendees")
      .doc(attendeeId)
      .get(),
    adminDb
      .collection("emailLogs")
      .where("attendeeId", "==", attendeeId)
      .orderBy("sentAt", "desc")
      .limit(20)
      .get(),
  ]);

  if (!attendeeSnap.exists) throw new Error("Attendee not found");

  return {
    attendee: attendeeSnap.data() as Attendee,
    emailLogs: logsSnap.docs.map((d) => ({
      id: d.id,
      emailType: d.data().emailType,
      sentAt: d.data().sentAt,
      status: d.data().status,
    })),
  };
}

export async function deleteAttendee(
  eventId: string,
  attendeeId: string,
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  const attendeeRef = adminDb
    .collection("events")
    .doc(eventId)
    .collection("attendees")
    .doc(attendeeId);

  try {
    const snap = await attendeeRef.get();
    if (!snap.exists) {
      return { success: false, error: "Attendee not found." };
    }

    const attendee = snap.data() as Attendee;
    if (attendee.couponId) {
      return {
        success: false,
        error: "Cannot delete an attendee with an assigned coupon. Unassign the coupon first.",
      };
    }

    const assignedCouponSnap = await adminDb
      .collection("events")
      .doc(eventId)
      .collection("coupons")
      .where("assignedTo", "==", attendeeId)
      .limit(1)
      .get();

    if (!assignedCouponSnap.empty) {
      return {
        success: false,
        error: "Cannot delete an attendee with an assigned coupon.",
      };
    }

    const deletedEmailLogs = await deleteQueryInBatches(
      adminDb.collection("emailLogs").where("attendeeId", "==", attendeeId)
    );

    if (attendee.claimToken) {
      await adminDb.collection("claimTokens").doc(attendee.claimToken).delete();
    }

    await attendeeRef.delete();

    await writeAuditLog({
      eventId,
      action: "attendee_deleted",
      metadata: {
        attendeeId,
        name: attendee.name,
        email: attendee.email,
        deletedEmailLogs,
      },
      userId: session.uid,
    });

    revalidatePath(`/events/${slug}/attendees`);
    revalidatePath(`/events/${slug}`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Delete failed.",
    };
  }
}
