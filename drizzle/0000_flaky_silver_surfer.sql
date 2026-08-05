CREATE TABLE "attendees" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"grant_count" integer DEFAULT 0 NOT NULL,
	"claimed_count" integer DEFAULT 0 NOT NULL,
	"claimed_any" boolean DEFAULT false NOT NULL,
	"email_status" text DEFAULT 'pending' NOT NULL,
	"email_sent_at" text,
	"claim_token" text,
	"created_at" text NOT NULL,
	"registered_at" text,
	"checked_in_at" text,
	"is_blacklisted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"action" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_links" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"event_id" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"assigned_to" text,
	"assigned_at" text,
	"claimed_at" text,
	"is_disabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"logo_url" text DEFAULT '' NOT NULL,
	"highlight" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"note" text,
	"shared_value" text,
	"redeem_url" text,
	"link_total" integer DEFAULT 0 NOT NULL,
	"link_available" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_disabled" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"attendee_id" text NOT NULL,
	"event_id" text NOT NULL,
	"email_type" text NOT NULL,
	"sent_at" text NOT NULL,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"date" text NOT NULL,
	"notion_guide_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	"luma_last_synced_at" text,
	"auto_send_email" boolean DEFAULT false NOT NULL,
	"tagline" text,
	"description" text,
	"time_label" text,
	"venue" text
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"coupon_id" text NOT NULL,
	"event_id" text NOT NULL,
	"attendee_id" text NOT NULL,
	"value" text NOT NULL,
	"link_id" text,
	"status" text DEFAULT 'assigned' NOT NULL,
	"assigned_at" text NOT NULL,
	"claimed_at" text,
	CONSTRAINT "grants_attendee_id_coupon_id_pk" PRIMARY KEY("attendee_id","coupon_id")
);
--> statement-breakpoint
ALTER TABLE "attendees" ADD CONSTRAINT "attendees_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_links" ADD CONSTRAINT "coupon_links_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_links" ADD CONSTRAINT "coupon_links_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_link_id_coupon_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."coupon_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendees_event_email_key" ON "attendees" USING btree ("event_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "attendees_claim_token_key" ON "attendees" USING btree ("claim_token");--> statement-breakpoint
CREATE INDEX "attendees_event_id_idx" ON "attendees" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "attendees_email_idx" ON "attendees" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_event_id_idx" ON "audit_logs" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "coupon_links_coupon_id_idx" ON "coupon_links" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "coupon_links_available_idx" ON "coupon_links" USING btree ("coupon_id") WHERE status = 'available' and not is_disabled;--> statement-breakpoint
CREATE INDEX "coupons_event_id_idx" ON "coupons" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "email_logs_attendee_id_idx" ON "email_logs" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "email_logs_event_id_idx" ON "email_logs" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_key" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "grants_link_id_key" ON "grants" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "grants_coupon_id_idx" ON "grants" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "grants_event_id_idx" ON "grants" USING btree ("event_id");