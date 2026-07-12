// ─── Attendee Confirmation Calling Module ─────────────────────────────────────
// Fully decoupled from the Event/coupon domain (lib/types.ts). New top-level
// Firestore collections: confirmationAttendees, confirmationVolunteers,
// confirmationAuditLogs.

export type ConfirmationStatus =
  | "need_confirmation"
  | "call_pending"
  | "call_done"
  | "confirm_coming"
  | "not_coming";

export const CONFIRMATION_STATUSES: ConfirmationStatus[] = [
  "need_confirmation",
  "call_pending",
  "call_done",
  "confirm_coming",
  "not_coming",
];

export type ConfirmationTeamRole = "lead" | "member" | "individual";

export interface ConfirmationAttendee {
  id: string; // hashString(normalizedEmail), idempotent re-upload
  name: string;
  email: string;
  phone?: string;
  extra?: Record<string, string>; // any other CSV columns, preserved verbatim
  status: ConfirmationStatus;
  assignedVolunteerId: string | null;
  assignedVolunteerName: string | null; // denormalized for admin table/team mapping
  assignedAt: string | null;
  statusUpdatedAt: string | null;
  notes?: string;
  createdAt: string;
  // ─── Team matching (derived from ticket_name + the team-lead/teammate CSV
  // column, e.g. "Create a Team" / "Join a Team"). teamKey is the normalized
  // email of the team's lead, shared by the lead and every teammate who
  // listed that lead's email — so grouping by teamKey reunites a team even
  // though each member is a separate CSV row/attendee record.
  teamKey?: string | null;
  teamRole?: ConfirmationTeamRole | null;
  ticketName?: string | null;
}

export interface ConfirmationVolunteer {
  id: string;
  name: string;
  username: string; // unique, slugified, shown in the link
  pin: string; // 4-digit
  token: string; // unique link secret, e.g. `${username}-${nanoid(6)}`
  isActive: boolean;
  createdAt: string;
  failedPinAttempts?: number;
  pinLockedUntil?: string | null;
}

export type ConfirmationAuditAction =
  | "attendees_imported"
  | "volunteer_created"
  | "volunteer_deactivated"
  | "volunteer_pin_reset"
  | "attendees_assigned"
  | "attendee_status_updated";

export interface ConfirmationAuditLog {
  id: string;
  action: ConfirmationAuditAction;
  actorType: "admin" | "volunteer";
  actorId: string;
  actorName?: string; // denormalized display name (volunteer name, or admin email/uid)
  attendeeId?: string;
  attendeeName?: string; // denormalized for readable log messages
  volunteerId?: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

// ─── CSV Import Result ─────────────────────────────────────────────────────────

export interface ConfirmationImportResult {
  imported: number;
  skipped: number;
  invalid: number;
  errors: string[];
}

// ─── Assignment Result ─────────────────────────────────────────────────────────

export interface ConfirmationAssignResult {
  volunteerCount: number;
  totalAssigned: number;
  perVolunteerCounts: Record<string, number>;
}

// ─── Stats ──────────────────────────────────────────────────────────────────────

export type ConfirmationStatusCounts = Record<ConfirmationStatus, number>;

export interface ConfirmationGlobalStats {
  total: number;
  byStatus: ConfirmationStatusCounts;
}

export interface ConfirmationVolunteerStats {
  volunteer: ConfirmationVolunteer;
  total: number;
  byStatus: ConfirmationStatusCounts;
}

// ─── Labels (shared across admin + volunteer UI) ───────────────────────────────

export const CONFIRMATION_STATUS_LABELS: Record<ConfirmationStatus, string> = {
  need_confirmation: "Need Confirmation",
  call_pending: "Call Pending",
  call_done: "Call Done",
  confirm_coming: "Confirmed Coming",
  not_coming: "Not Coming",
};
