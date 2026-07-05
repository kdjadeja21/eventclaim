// ─── Enums ────────────────────────────────────────────────────────────────────

export type EventStatus = "draft" | "active" | "completed";

export type CouponKind = "uniqueLink" | "sharedCode" | "sharedLink";

export type CouponLinkStatus = "available" | "assigned" | "claimed";

export type GrantStatus = "assigned" | "claimed";

export type EmailStatus = "pending" | "sent" | "failed";

export type AuditAction =
  | "event_created"
  | "event_updated"
  | "event_deleted"
  | "event_hero_updated"
  | "attendee_imported"
  | "attendee_deleted"
  | "attendee_luma_synced"
  | "attendee_blacklisted"
  | "attendee_unblacklisted"
  | "registrations_luma_synced"
  | "teams_auto_built"
  | "team_created"
  | "team_updated"
  | "team_deleted"
  | "team_member_assigned"
  | "team_member_removed"
  | "teams_data_cleared"
  | "team_link_confirmed"
  | "team_link_rejected"
  | "team_registration_pooled"
  | "coupon_created"
  | "coupon_updated"
  | "coupon_deleted"
  | "coupon_disabled"
  | "coupon_enabled"
  | "coupon_links_added"
  | "coupon_granted"
  | "coupon_unassigned"
  | "coupon_link_deleted"
  | "grant_claimed"
  | "email_sent"
  | "email_resent"
  | "email_failed"
  | "status_checked";

// ─── Team / Registration Enums ──────────────────────────────────────────────

export type TicketCategory = "create_team" | "join_team" | "find_team" | "unknown";

export type RegistrationRole = "lead" | "member" | "individual";

export type TeamStatus =
  | "complete"
  | "incomplete"
  | "unassigned"
  | "manual"
  | "needs_review";

export type TeamSource = "auto" | "manual";

export type TeamIssue =
  | "missing_member"
  | "unmatched_lead"
  | "invalid_team_answer"
  | "no_lead"
  | "duplicate_member"
  | "size_under"
  | "size_over"
  | "fuzzy_match_pending"
  | "ticket_mismatch";

export type TeamIntentKind = "lead" | "member" | "individual" | "ambiguous";

export type TeamAnswerQuality =
  | "valid"
  | "empty"
  | "individual_keyword"
  | "garbage"
  | "self_only";

export interface TeamIntent {
  kind: TeamIntentKind;
  referencedEmails: string[];
  rawQuality: TeamAnswerQuality;
  confidence: number;
}

export interface SuggestedLink {
  fromEmail: string;
  toRegistrationId: string;
  toEmail: string;
  score: number;
  reason: string;
}

export interface TeamRules {
  minSize: number;
  maxSize: number;
  allowOversized: boolean;
}

export interface TicketTypeMap {
  create_team?: string[];
  join_team?: string[];
  find_team?: string[];
}

export interface TeamLink {
  id: string;
  eventId: string;
  fromRegistrationId: string;
  toEmail: string;
  toRegistrationId: string | null;
  linkType: "expects_member" | "expects_lead" | "confirmed_fuzzy";
  createdAt: string;
  createdBy: string;
}

// ─── Firestore Document Types ─────────────────────────────────────────────────

export interface Event {
  id: string;
  name: string;
  slug: string;
  date: string; // ISO date string
  notionGuideUrl: string;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
  lumaLastSyncedAt?: string | null;
  lumaEventId?: string | null;
  teamRules?: TeamRules;
  teamQuestionId?: string;
  ticketTypeMap?: TicketTypeMap;
  // Hero fields for claim landing page
  tagline?: string;
  description?: string;
  timeLabel?: string; // e.g. "10:00 – 14:00"
  venue?: string;     // e.g. "Trekanten, Oslo"
}

export interface RegistrationAnswerSnapshot {
  label: string;
  questionId: string;
  answer: string;
}

export interface Registration {
  id: string;
  eventId: string;
  lumaGuestId: string;
  email: string;
  name: string;
  phone?: string | null;
  ticketTypeId: string;
  ticketName: string;
  ticketCategory: TicketCategory;
  rawTicketCategory?: TicketCategory;
  teamAnswerRaw: string;
  parsedTeamEmails: string[];
  parsedTeamLeadEmail: string | null;
  teamIntent?: TeamIntent;
  reviewFlags?: TeamIssue[];
  role: RegistrationRole;
  teamId: string | null;
  inPool?: boolean;
  registrationAnswers: RegistrationAnswerSnapshot[];
  registeredAt: string | null;
  approvalStatus: string;
  checkedInAt: string | null;
  attendeeId: string | null;
  isManualMapping: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
}

export interface Team {
  id: string;
  eventId: string;
  name: string;
  leadRegistrationId: string | null;
  leadEmail: string | null;
  memberRegistrationIds: string[];
  memberEmails: string[];
  expectedMemberEmails: string[];
  ticketCategory: TicketCategory;
  status: TeamStatus;
  source: TeamSource;
  issues: TeamIssue[];
  confidence?: number;
  suggestedLinks?: SuggestedLink[];
  sizeExpected?: number;
  sizeActual?: number;
  reviewSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamFormationStats {
  formedTeams: number;
  completeTeams: number;
  incompleteTeams: number;
  needsReviewTeams: number;
  poolCount: number;
  autoResolvedPercent: number;
}

export interface TeamWithMembers extends Team {
  lead: Registration | null;
  members: Registration[];
}

export interface Attendee {
  id: string;
  eventId: string;
  name: string;
  email: string;
  // Grant tracking (replaces old couponId/couponLink/claimed fields)
  grantCount: number;       // how many grants this attendee has
  claimedAny: boolean;      // true when any grant has been claimed
  emailStatus: EmailStatus;
  emailSentAt: string | null;
  claimToken: string | null;
  createdAt: string;
  registeredAt?: string | null;
  checkedInAt?: string | null;
  isBlacklisted?: boolean;
}

/**
 * A Coupon Definition — one "partner offer" card.
 * Stored at events/{eventId}/coupons/{couponId}.
 */
export interface Coupon {
  id: string;
  eventId: string;
  name: string;
  kind: CouponKind;
  // Presentation fields (drive the claim landing page card)
  category: string;           // e.g. "VOICE DICTATION"
  logoUrl: string;            // partner logo URL
  highlight: string;          // gift line, e.g. "3 months of Pro, comped"
  description: string;        // redeem instructions paragraph
  note?: string;              // optional callout box text
  // Value
  sharedValue?: string;       // sharedCode: the code; sharedLink: the URL
  redeemUrl?: string;         // optional how-to-redeem doc/guide link
  // Pool stats for uniqueLink (denormalized)
  linkTotal?: number;
  linkAvailable?: number;
  // Meta
  sortOrder: number;
  isDisabled: boolean;
  createdAt: string;
}

/**
 * A single-use URL pool entry for uniqueLink coupons.
 * Stored at events/{eventId}/coupons/{couponId}/links/{linkId}.
 */
export interface CouponLink {
  id: string;
  couponId: string;
  eventId: string;
  url: string;
  status: CouponLinkStatus;
  assignedTo: string | null;  // attendeeId
  assignedAt: string | null;
  claimedAt: string | null;
  isDisabled?: boolean;
}

/**
 * An attendee's copy of a coupon — the actual value they can redeem.
 * Stored at events/{eventId}/attendees/{attendeeId}/grants/{couponId}.
 * The coupon id is used as the document id for idempotency.
 */
export interface Grant {
  couponId: string;
  eventId: string;
  attendeeId: string;
  value: string;              // unique URL / shared code / shared link
  linkId?: string;            // set for uniqueLink grants
  status: GrantStatus;
  assignedAt: string;
  claimedAt: string | null;
}

export interface EmailLog {
  id: string;
  attendeeId: string;
  eventId: string;
  emailType: "initial" | "resend";
  sentAt: string;
  resendCount: number;
  status: "sent" | "failed";
  error?: string;
}

export interface AuditLog {
  id: string;
  eventId: string | null;
  action: AuditAction;
  metadata: Record<string, unknown>;
  userId: string;
  timestamp: string;
}

export interface ClaimToken {
  token: string;
  eventId: string;
  attendeeId: string;
  createdAt: string;
}

// ─── CSV Import Result Types ──────────────────────────────────────────────────

export interface AttendeeImportResult {
  imported: number;
  skipped: number;
  invalid: number;
  waitingForCoupon: number;
  assigned: number;
  errors: string[];
}

export interface CouponImportResult {
  imported: number;
  duplicatesSkipped: number;
  invalidSkipped: number;
  autoGranted: number;
  errors: string[];
}

// ─── Coupon Management Types ──────────────────────────────────────────────────

/** Per-coupon stats shown on the admin coupons page. */
export interface CouponStats {
  total: number;       // total links (uniqueLink) or 1 (shared)
  available: number;   // links not yet assigned (uniqueLink only)
  granted: number;     // number of attendees with this grant
  claimed: number;     // number of attendees who claimed
  claimRate: number;   // claimed / granted * 100
  disabled: boolean;
}

/** Coupon definition enriched with per-coupon stats for the admin table. */
export interface CouponWithStats extends Coupon {
  stats: CouponStats;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface EventStats {
  totalAttendees: number;
  totalCouponDefs: number;    // number of coupon definitions
  totalGranted: number;       // total grants assigned across all attendees
  totalEmailsSent: number;
  totalEmailsPending: number;
  totalEmailsFailed: number;
  totalClaimed: number;
  claimRate: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if a coupon definition is active and can receive new grants. */
export function isCouponGrantable(
  coupon: Pick<Coupon, "isDisabled" | "kind" | "linkAvailable">
): boolean {
  if (coupon.isDisabled) return false;
  if (coupon.kind === "uniqueLink") return (coupon.linkAvailable ?? 0) > 0;
  return true;
}
