import { adminDb } from "@/lib/firebase/admin";
import {
  CONFIRMATION_STATUSES,
  ConfirmationGlobalStats,
  ConfirmationStatus,
  ConfirmationStatusCounts,
  ConfirmationVolunteer,
  ConfirmationVolunteerStats,
} from "@/lib/confirmation/types";

function emptyStatusCounts(): ConfirmationStatusCounts {
  return CONFIRMATION_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {} as ConfirmationStatusCounts);
}

export async function getConfirmationGlobalStats(): Promise<ConfirmationGlobalStats> {
  const attendeesRef = adminDb.collection("confirmationAttendees");

  const [totalSnap, ...statusSnaps] = await Promise.all([
    attendeesRef.count().get(),
    ...CONFIRMATION_STATUSES.map((status) =>
      attendeesRef.where("status", "==", status).count().get()
    ),
  ]);

  const byStatus = emptyStatusCounts();
  CONFIRMATION_STATUSES.forEach((status, i) => {
    byStatus[status] = statusSnaps[i].data().count;
  });

  return {
    total: totalSnap.data().count,
    byStatus,
  };
}

export async function getConfirmationVolunteerStats(
  volunteers: ConfirmationVolunteer[]
): Promise<ConfirmationVolunteerStats[]> {
  const attendeesRef = adminDb.collection("confirmationAttendees");

  return Promise.all(
    volunteers.map(async (volunteer) => {
      const assignedRef = attendeesRef.where(
        "assignedVolunteerId",
        "==",
        volunteer.id
      );

      const [totalSnap, ...statusSnaps] = await Promise.all([
        assignedRef.count().get(),
        ...CONFIRMATION_STATUSES.map((status) =>
          assignedRef.where("status", "==", status).count().get()
        ),
      ]);

      const byStatus = emptyStatusCounts();
      CONFIRMATION_STATUSES.forEach((status: ConfirmationStatus, i) => {
        byStatus[status] = statusSnaps[i].data().count;
      });

      return {
        volunteer,
        total: totalSnap.data().count,
        byStatus,
      };
    })
  );
}
