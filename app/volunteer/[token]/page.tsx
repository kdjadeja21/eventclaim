import { notFound } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { getVolunteerByToken } from "@/lib/confirmation/volunteer-auth";
import { getVolunteerSession } from "@/lib/confirmation/volunteer-session";
import { ConfirmationAttendee } from "@/lib/confirmation/types";
import { PinForm } from "./pin-form";
import { AttendeeList } from "./attendee-list";

type Props = { params: Promise<{ token: string }> };

export default async function VolunteerPage({ params }: Props) {
  const { token } = await params;

  const volunteer = await getVolunteerByToken(token);
  if (!volunteer || !volunteer.isActive) notFound();

  const session = await getVolunteerSession();
  if (!session || session.volunteerId !== volunteer.id) {
    return <PinForm token={token} volunteerName={volunteer.name} />;
  }

  const snap = await adminDb
    .collection("confirmationAttendees")
    .where("assignedVolunteerId", "==", volunteer.id)
    .get();
  const attendees = snap.docs.map((d) => d.data() as ConfirmationAttendee);

  return <AttendeeList token={token} volunteerName={volunteer.name} attendees={attendees} />;
}
