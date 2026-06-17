// ─── Enums ────────────────────────────────────────────────────────────────────

export type EventStatus = "draft" | "active" | "completed";

export type CouponStatus = "available" | "assigned" | "emailSent" | "claimed";

export type EmailStatus = "pending" | "sent" | "failed";

export type AuditAction =
  | "event_created"
  | "event_updated"
  | "event_deleted"
  | "attendee_imported"
  | "attendee_deleted"
  | "attendee_luma_synced"
  | "coupon_imported"
  | "coupon_assigned"
  | "coupon_unassigned"
  | "coupon_added"
  | "email_sent"
  | "email_resent"
  | "email_failed"
  | "coupon_claimed"
  | "status_checked";

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
}

export interface Attendee {
  id: string;
  eventId: string;
  name: string;
  email: string;
  couponId: string | null;
  couponLink: string | null;
  emailStatus: EmailStatus;
  emailSentAt: string | null;
  claimed: boolean;
  claimedAt: string | null;
  claimToken: string | null;
  createdAt: string;
  registeredAt?: string | null;
  checkedInAt?: string | null;
  isBlacklisted?: boolean;
}

export interface Coupon {
  id: string;
  eventId: string;
  couponLink: string;
  assignedTo: string | null; // attendeeId
  status: CouponStatus;
  assignedAt: string | null;
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
  autoAssigned: number;
  errors: string[];
}

// ─── Coupon Management Types ──────────────────────────────────────────────────

export interface CouponWithAttendee extends Coupon {
  attendeeName: string | null;
  attendeeEmail: string | null;
}

export interface CouponStats {
  total: number;
  available: number;
  assigned: number;
  emailSent: number;
  claimed: number;
  unclaimed: number;
  assignRate: number;
  claimRate: number;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface EventStats {
  totalAttendees: number;
  totalCoupons: number;
  totalAssigned: number;
  totalAvailable: number;
  totalEmailsSent: number;
  totalEmailsPending: number;
  totalEmailsFailed: number;
  totalClaimed: number;
  totalUnclaimed: number;
  claimRate: number;
}
