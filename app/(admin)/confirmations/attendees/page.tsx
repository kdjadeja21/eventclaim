import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import {
  ConfirmationAttendee,
  ConfirmationStatus,
  ConfirmationVolunteer,
  CONFIRMATION_STATUSES,
} from "@/lib/confirmation/types";
import { AttendeeTable } from "./attendee-table";
import { ConfirmationSectionNav } from "../confirmation-section-nav";

async function getAttendeesData() {
  await requireSession();

  const [attendeesSnap, volunteersSnap] = await Promise.all([
    adminDb.collection("confirmationAttendees").orderBy("createdAt", "desc").get(),
    adminDb.collection("confirmationVolunteers").orderBy("createdAt", "asc").get(),
  ]);

  const attendees = attendeesSnap.docs.map((d) => d.data() as ConfirmationAttendee);
  const volunteers = volunteersSnap.docs.map((d) => d.data() as ConfirmationVolunteer);

  return { attendees, volunteers };
}

type Props = { searchParams: Promise<{ status?: string }> };

export default async function AttendeesPage({ searchParams }: Props) {
  const { attendees, volunteers } = await getAttendeesData();
  const { status } = await searchParams;
  const initialStatus = CONFIRMATION_STATUSES.includes(status as ConfirmationStatus)
    ? (status as ConfirmationStatus)
    : "all";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight gradient-text">
          Attendees
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          All approved attendees, their confirmation status, team, and volunteer
          assignment
        </p>
      </div>

      <ConfirmationSectionNav active="attendees" />

      <AttendeeTable
        attendees={attendees}
        volunteers={volunteers}
        initialStatus={initialStatus}
      />
    </div>
  );
}
