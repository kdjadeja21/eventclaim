"use server";

import { adminDb } from "@/lib/firebase/admin";
import { requireSession } from "@/lib/session";
import { resolveAndPersistConfirmationTeams } from "@/lib/confirmation/team-resolve-service";
import { writeConfirmationAuditLog } from "@/lib/confirmation/audit";
import { ConfirmationAttendee, ConfirmationTeamFormationStats } from "@/lib/confirmation/types";
import { normalizeEmail } from "@/lib/utils";
import { revalidatePath } from "next/cache";

function revalidateTeamPaths() {
  revalidatePath("/confirmations");
  revalidatePath("/confirmations/attendees");
  revalidatePath("/confirmations/teams");
}

export async function resolveTeamsAction(): Promise<{
  success: boolean;
  stats?: ConfirmationTeamFormationStats;
  error?: string;
}> {
  const session = await requireSession();
  try {
    const stats = await resolveAndPersistConfirmationTeams(session.uid);
    revalidateTeamPaths();
    return { success: true, stats };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to resolve teams.",
    };
  }
}

/**
 * Confirms a suggested fuzzy-match fix: corrects the referencing attendee's
 * teamIntent so it points at the matched attendee's actual email instead of
 * the mistyped one, then re-runs team resolution.
 */
export async function confirmSuggestedLinkAction(
  referencingAttendeeId: string,
  wrongEmail: string,
  correctedAttendeeId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireSession();

  try {
    const [referencingSnap, correctedSnap] = await Promise.all([
      adminDb.collection("confirmationAttendees").doc(referencingAttendeeId).get(),
      adminDb.collection("confirmationAttendees").doc(correctedAttendeeId).get(),
    ]);

    if (!referencingSnap.exists) return { success: false, error: "Attendee not found." };
    if (!correctedSnap.exists) return { success: false, error: "Matched attendee not found." };

    const referencing = referencingSnap.data() as ConfirmationAttendee;
    const corrected = correctedSnap.data() as ConfirmationAttendee;

    const wrongNormalized = normalizeEmail(wrongEmail);
    const correctedEmail = normalizeEmail(corrected.email);

    const currentEmails = referencing.teamIntent?.referencedEmails ?? [];
    const fixedEmails = [
      ...new Set(
        currentEmails
          .map((e) => (normalizeEmail(e) === wrongNormalized ? correctedEmail : normalizeEmail(e)))
      ),
    ];

    await referencingSnap.ref.update({
      "teamIntent.referencedEmails": fixedEmails,
      "teamIntent.quality": "ok",
    });

    await writeConfirmationAuditLog({
      action: "teams_resolved",
      actorType: "admin",
      actorId: session.uid,
      actorName: session.email ?? session.uid,
      attendeeId: referencingAttendeeId,
      attendeeName: referencing.name,
      metadata: {
        source: "confirmed_fuzzy_match",
        wrongEmail: wrongNormalized,
        correctedEmail,
        correctedAttendeeName: corrected.name,
      },
    });

    await resolveAndPersistConfirmationTeams(session.uid);
    revalidateTeamPaths();
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to confirm match.",
    };
  }
}
