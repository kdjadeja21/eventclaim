import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { ConfirmationVolunteer } from "@/lib/confirmation/types";
import { getConfirmationVolunteerStats } from "@/lib/confirmation/stats";
import { VolunteersTable } from "./volunteers-table";

async function getVolunteersData() {
  await requireSession();

  const snap = await adminDb
    .collection("confirmationVolunteers")
    .orderBy("createdAt", "desc")
    .get();

  const volunteers = snap.docs.map((d) => d.data() as ConfirmationVolunteer);
  const stats = await getConfirmationVolunteerStats(volunteers);

  return stats;
}

export default async function VolunteersPage() {
  const volunteerStats = await getVolunteersData();
  const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight gradient-text">
          Volunteers
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Create volunteers and share their unique call-list link + PIN.
        </p>
      </div>

      <VolunteersTable volunteerStats={volunteerStats} baseUrl={baseUrl} />
    </div>
  );
}
