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

// ─── Team formation (see lib/confirmation/team-resolver.ts) ───────────────────

/** What a row's ticket_name + team-question CSV columns seem to indicate. */
export type ConfirmationTeamIntentKind = "lead" | "member" | "individual" | "ambiguous";

/** How usable the raw team-question answer was for actually forming a team. */
export type ConfirmationTeamAnswerQuality =
  | "ok" // parsed one or more teammate/lead emails
  | "individual" // explicitly said "Individual" or similar
  | "empty" // left blank
  | "self_only" // only listed their own email
  | "garbage"; // non-empty but no email could be extracted

export interface ConfirmationTeamIntent {
  kind: ConfirmationTeamIntentKind;
  referencedEmails: string[]; // normalized emails this row references, excludes self
  rawValue: string | null; // the raw team-question column text, for admin review
  quality: ConfirmationTeamAnswerQuality;
}

export type ConfirmationTeamIssue =
  | "no_lead"
  | "duplicate_member"
  | "missing_member"
  | "unmatched_lead"
  | "fuzzy_match_pending"
  | "size_under"
  | "size_over";

export type ConfirmationTeamStatus = "complete" | "incomplete" | "needs_review";

export interface ConfirmationSuggestedLink {
  fromEmail: string;
  toAttendeeId: string;
  toEmail: string;
  score: number;
  reason: string;
}

export interface ConfirmationTeamRules {
  minSize: number;
  maxSize: number;
  allowOversized: boolean;
}

export const DEFAULT_TEAM_RULES: ConfirmationTeamRules = {
  minSize: 2,
  maxSize: 6,
  allowOversized: true,
};

/**
 * A resolved team, computed by lib/confirmation/team-resolver.ts and
 * persisted to the confirmationTeams collection so admins/volunteers can
 * review a whole team at once instead of piecing it together attendee by
 * attendee.
 */
export interface ConfirmationTeam {
  id: string;
  leadAttendeeId: string | null;
  leadEmail: string | null;
  leadName: string | null;
  memberAttendeeIds: string[]; // excludes the lead
  expectedMemberEmails: string[]; // emails the lead listed but who haven't registered/matched yet
  status: ConfirmationTeamStatus;
  issues: ConfirmationTeamIssue[];
  confidence: number; // 0-1
  suggestedLinks: ConfirmationSuggestedLink[];
  sizeExpected: number;
  sizeActual: number;
  reviewSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmationTeamFormationStats {
  formedTeams: number;
  completeTeams: number;
  incompleteTeams: number;
  needsReviewTeams: number;
  poolCount: number;
  totalAttendees: number;
  autoResolvedPercent: number;
  updatedAt: string;
}

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
  // ─── Team matching ────────────────────────────────────────────────────────
  // teamIntent is the raw signal parsed from the CSV (ticket_name + the
  // team-lead/teammate column) at upload time. teamKey/teamRole/inPool are
  // *derived* by running the team resolver across ALL attendees (not just one
  // upload batch) and are only trustworthy after a resolve pass has run.
  teamIntent?: ConfirmationTeamIntent | null;
  ticketName?: string | null;
  teamKey?: string | null; // resolved ConfirmationTeam.id, shared by the whole team
  teamRole?: ConfirmationTeamRole | null; // resolved role within that team
  inPool?: boolean; // true if the resolver couldn't place them on any team
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
  | "attendee_status_updated"
  | "teams_resolved";

export interface ConfirmationAuditLog {
  id: string;
  action: ConfirmationAuditAction;
  actorType: "admin" | "volunteer";
  actorId: string;
  actorName?: string; // denormalized display name (volunteer name, or admin email/uid)
  actorUsername?: string; // volunteer username — preferred identity in admin logs
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
