import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { ConfirmationAttendee, ConfirmationVolunteer } from "@/lib/confirmation/types";
import { AttendeeTable } from "./attendee-table";

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

export default async function AttendeesPage() {
  const { attendees, volunteers } = await getAttendeesData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight gradient-text">
          Attendees
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          All uploaded attendees, their confirmation status, and volunteer assignment
        </p>
      </div>

      <AttendeeTable attendees={attendees} volunteers={volunteers} />
    </div>
  );
}
