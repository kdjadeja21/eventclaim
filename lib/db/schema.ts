import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// All timestamp-ish fields keep the app's existing ISO-string shape (text
// columns) rather than native `timestamp`, so the repo layer is a drop-in
// replacement for the Firestore data shape with zero type changes in
// lib/types.ts. audit_logs.timestamp is the one exception, kept as a real
// `timestamptz` so `orderBy` sorts correctly independent of string format;
// repos convert it to/from ISO strings at the boundary.

// ─── events ────────────────────────────────────────────────────────────────

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    date: text("date").notNull(),
    notionGuideUrl: text("notion_guide_url").notNull().default(""),
    status: text("status", { enum: ["draft", "active", "completed"] })
      .notNull()
      .default("draft"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    /** Firebase UID of the creating admin. Null = legacy shared/pre-isolation rows. */
    ownerUid: text("owner_uid"),
    lumaLastSyncedAt: text("luma_last_synced_at"),
    autoSendEmail: boolean("auto_send_email").notNull().default(false),
    tagline: text("tagline"),
    description: text("description"),
    timeLabel: text("time_label"),
    venue: text("venue"),
  },
  (table) => [
    uniqueIndex("events_slug_key").on(table.slug),
    index("events_owner_uid_idx").on(table.ownerUid),
  ]
);

// ─── attendees ───────────────────────────────────────────────────────────────

export const attendees = pgTable(
  "attendees",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    grantCount: integer("grant_count").notNull().default(0),
    claimedCount: integer("claimed_count").notNull().default(0),
    claimedAny: boolean("claimed_any").notNull().default(false),
    emailStatus: text("email_status", {
      enum: ["pending", "sending", "sent", "failed"],
    })
      .notNull()
      .default("pending"),
    emailSentAt: text("email_sent_at"),
    claimToken: text("claim_token"),
    createdAt: text("created_at").notNull(),
    registeredAt: text("registered_at"),
    checkedInAt: text("checked_in_at"),
    isBlacklisted: boolean("is_blacklisted").notNull().default(false),
    isTest: boolean("is_test").notNull().default(false),
  },
  (table) => [
    uniqueIndex("attendees_event_email_key").on(table.eventId, table.email),
    uniqueIndex("attendees_claim_token_key").on(table.claimToken),
    index("attendees_event_id_idx").on(table.eventId),
    index("attendees_email_idx").on(table.email),
  ]
);

// ─── coupons ───────────────────────────────────────────────────────────────

export const coupons = pgTable(
  "coupons",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["uniqueLink", "sharedCode", "sharedLink"] }).notNull(),
    category: text("category").notNull().default(""),
    logoUrl: text("logo_url").notNull().default(""),
    highlight: text("highlight").notNull().default(""),
    description: text("description").notNull().default(""),
    note: text("note"),
    sharedValue: text("shared_value"),
    redeemUrl: text("redeem_url"),
    linkTotal: integer("link_total").notNull().default(0),
    linkAvailable: integer("link_available").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    isDisabled: boolean("is_disabled").notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("coupons_event_id_idx").on(table.eventId)]
);

// ─── coupon_links ────────────────────────────────────────────────────────────

export const couponLinks = pgTable(
  "coupon_links",
  {
    id: text("id").primaryKey(),
    couponId: text("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    status: text("status", { enum: ["available", "assigned", "claimed"] })
      .notNull()
      .default("available"),
    assignedTo: text("assigned_to"),
    assignedAt: text("assigned_at"),
    claimedAt: text("claimed_at"),
    isDisabled: boolean("is_disabled").notNull().default(false),
    isTest: boolean("is_test").notNull().default(false),
  },
  (table) => [
    index("coupon_links_coupon_id_idx").on(table.couponId),
    // Speeds up "find an available link to reserve" — the hottest query.
    index("coupon_links_available_idx")
      .on(table.couponId)
      .where(sql`status = 'available' and not is_disabled`),
  ]
);

// ─── grants ──────────────────────────────────────────────────────────────────

export const grants = pgTable(
  "grants",
  {
    couponId: text("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    linkId: text("link_id").references(() => couponLinks.id, { onDelete: "set null" }),
    status: text("status", { enum: ["assigned", "claimed"] })
      .notNull()
      .default("assigned"),
    assignedAt: text("assigned_at").notNull(),
    claimedAt: text("claimed_at"),
  },
  (table) => [
    primaryKey({ columns: [table.attendeeId, table.couponId] }),
    uniqueIndex("grants_link_id_key").on(table.linkId),
    index("grants_coupon_id_idx").on(table.couponId),
    index("grants_event_id_idx").on(table.eventId),
  ]
);

// ─── email_logs ──────────────────────────────────────────────────────────────

export const emailLogs = pgTable(
  "email_logs",
  {
    id: text("id").primaryKey(),
    attendeeId: text("attendee_id")
      .notNull()
      .references(() => attendees.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    emailType: text("email_type", { enum: ["initial", "resend"] }).notNull(),
    sentAt: text("sent_at").notNull(),
    resendCount: integer("resend_count").notNull().default(0),
    status: text("status", { enum: ["sent", "failed"] }).notNull(),
    error: text("error"),
  },
  (table) => [
    index("email_logs_attendee_id_idx").on(table.attendeeId),
    index("email_logs_event_id_idx").on(table.eventId),
  ]
);

// ─── audit_logs ──────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    // Intentionally NOT a foreign key: history must survive event deletion
    // (deleteEvent writes a log referencing the just-deleted event's id).
    eventId: text("event_id"),
    action: text("action").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    userId: text("user_id").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_timestamp_idx").on(table.timestamp),
    index("audit_logs_event_id_idx").on(table.eventId),
  ]
);
