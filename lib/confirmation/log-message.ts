import {
  CONFIRMATION_STATUS_LABELS,
  ConfirmationAuditLog,
  ConfirmationStatus,
} from "@/lib/confirmation/types";

function getMetadataString(
  metadata: ConfirmationAuditLog["metadata"],
  key: string
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Human-readable summary of a confirmation audit log entry — used on both the
 * dashboard's recent activity feed and the full logs table. For status
 * updates, this always calls out which volunteer (or admin) made the change.
 */
export function getConfirmationLogMessage(log: ConfirmationAuditLog): string {
  const { metadata } = log;

  switch (log.action) {
    case "attendee_status_updated": {
      const status = getMetadataString(metadata, "status") as ConfirmationStatus | null;
      const statusLabel = status ? CONFIRMATION_STATUS_LABELS[status] : "a new status";
      const who =
        log.actorType === "volunteer"
          ? `by volunteer ${log.actorName ?? log.volunteerId ?? "(unknown)"}`
          : `by ${log.actorName ?? "an admin"}`;
      return `Status for ${log.attendeeName ?? "an attendee"} was set to "${statusLabel}" ${who}.`;
    }
    case "attendees_imported": {
      const imported = metadata.imported;
      const skipped = metadata.skipped;
      const invalid = metadata.invalid;
      return `Imported ${imported ?? "?"} attendees (skipped ${skipped ?? 0}, invalid ${invalid ?? 0}).`;
    }
    case "volunteer_created":
      return `Volunteer "${getMetadataString(metadata, "name") ?? log.actorName ?? "unknown"}" was created.`;
    case "volunteer_deactivated": {
      const isActive = metadata.isActive;
      return `Volunteer was ${isActive ? "reactivated" : "deactivated"}.`;
    }
    case "volunteer_pin_reset":
      return "Volunteer PIN was reset.";
    case "teams_resolved": {
      const source = getMetadataString(metadata, "source");
      if (source === "confirmed_fuzzy_match") {
        const correctedEmail = getMetadataString(metadata, "correctedEmail");
        const correctedAttendeeName = getMetadataString(metadata, "correctedAttendeeName");
        return `${log.attendeeName ?? "An attendee"}'s team link was corrected to ${
          correctedAttendeeName ?? correctedEmail ?? "a matched attendee"
        } by ${log.actorName ?? "an admin"}.`;
      }
      const formedTeams = metadata.formedTeams;
      const needsReviewTeams = metadata.needsReviewTeams;
      return `Teams were re-resolved: ${formedTeams ?? "?"} teams formed (${needsReviewTeams ?? 0} need review).`;
    }
    case "attendees_assigned": {
      const source = getMetadataString(metadata, "source");
      if (source === "admin_manual_reassign") {
        const volunteerName = getMetadataString(metadata, "volunteerName");
        return `${log.attendeeName ?? "An attendee"} was ${
          volunteerName ? `reassigned to ${volunteerName}` : "unassigned"
        } by ${log.actorName ?? "an admin"}.`;
      }
      const totalAssigned = metadata.totalAssigned;
      const volunteerCount = metadata.volunteerCount;
      return `${totalAssigned ?? "?"} attendees were assigned across ${volunteerCount ?? "?"} volunteers.`;
    }
    default:
      return log.actorType === "volunteer"
        ? `Action performed by volunteer ${log.actorName ?? "(unknown)"}.`
        : "Action performed by an admin.";
  }
}
