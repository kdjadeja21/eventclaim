import { notFound } from "next/navigation";
import { getVolunteerByToken } from "@/lib/confirmation/volunteer-auth";
import { getVolunteerSession } from "@/lib/confirmation/volunteer-session";
import { getVolunteerAttendee } from "../volunteer-actions";
import { PinForm } from "../pin-form";
import { StatusForm } from "./status-form";

type Props = { params: Promise<{ token: string; attendeeId: string }> };

export default async function AttendeeDetailPage({ params }: Props) {
  const { token, attendeeId } = await params;

  const volunteer = await getVolunteerByToken(token);
  if (!volunteer || !volunteer.isActive) notFound();

  const session = await getVolunteerSession();
  if (!session || session.volunteerId !== volunteer.id) {
    return <PinForm token={token} volunteerName={volunteer.name} />;
  }

  const attendee = await getVolunteerAttendee(token, attendeeId);
  if (!attendee) notFound();

  return <StatusForm token={token} attendee={attendee} />;
}
