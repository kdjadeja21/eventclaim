ALTER TABLE "events" ADD COLUMN "owner_uid" text;--> statement-breakpoint
CREATE INDEX "events_owner_uid_idx" ON "events" USING btree ("owner_uid");
