import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { computeTeamFormationStats } from "@/lib/confirmation/team-resolver";
import { ConfirmationAttendee, ConfirmationTeam } from "@/lib/confirmation/types";
import { ConfirmationSectionNav } from "../confirmation-section-nav";
import { TeamsView } from "./teams-view";

async function getTeamsData() {
  await requireSession();

  const [teamsSnap, attendeesSnap] = await Promise.all([
    adminDb.collection("confirmationTeams").get(),
    adminDb.collection("confirmationAttendees").get(),
  ]);

  const teams = teamsSnap.docs.map((d) => d.data() as ConfirmationTeam);
  const attendees = attendeesSnap.docs.map((d) => d.data() as ConfirmationAttendee);
  const stats = computeTeamFormationStats(teams, attendees);

  return { teams, attendees, stats };
}

export default async function TeamsPage() {
  const { teams, attendees, stats } = await getTeamsData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight gradient-text">Teams</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review whole teams at once — who&apos;s the lead, who&apos;s missing, and any
          typo&apos;d emails that need a quick confirm.
        </p>
      </div>

      <ConfirmationSectionNav active="teams" />

      <TeamsView teams={teams} attendees={attendees} stats={stats} />
    </div>
  );
}
