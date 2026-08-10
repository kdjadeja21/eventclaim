-- Portal access-control roster. Google Auth alone no longer grants admin
-- access; a row with status = 'approved' is required. The sole access-management
-- admin is seeded as approved so they are never locked out.

CREATE TABLE IF NOT EXISTS "portal_users" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "firebase_uid" text,
  "display_name" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_at" text NOT NULL,
  "reviewed_at" text,
  "reviewed_by" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portal_users_email_key" ON "portal_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_users_status_idx" ON "portal_users" USING btree ("status");--> statement-breakpoint

-- Seed the access-management admin (idempotent).
INSERT INTO "portal_users" (
  "id",
  "email",
  "firebase_uid",
  "display_name",
  "status",
  "requested_at",
  "reviewed_at",
  "reviewed_by",
  "created_at",
  "updated_at"
)
VALUES (
  'access-admin-seed',
  'kdjadeja209@gmail.com',
  NULL,
  'Access Admin',
  'approved',
  '2026-08-10T00:00:00.000Z',
  '2026-08-10T00:00:00.000Z',
  'kdjadeja209@gmail.com',
  '2026-08-10T00:00:00.000Z',
  '2026-08-10T00:00:00.000Z'
)
ON CONFLICT (email) DO NOTHING;--> statement-breakpoint

-- Deny-all RLS posture (same as other app tables).
ALTER TABLE "portal_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON portal_users FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON portal_users FROM authenticated';
  END IF;
END;
$$;
