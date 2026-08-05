# Supabase setup guide for EventClaim

This project stores all app data (events, attendees, coupons, grants, audit logs, etc.) in **Supabase Postgres**. It connects with **Drizzle ORM + `postgres.js` over a raw Postgres connection string** — not the Supabase JavaScript client (`@supabase/supabase-js`) and not Supabase Auth.

Firebase is still used for **Google sign-in / session cookies** and **coupon logo uploads** only.

---

## What you need from Supabase

You need **two connection strings** from the same Supabase project:

| Env var | Connection type | Port | Used by |
|---------|-----------------|------|---------|
| `DATABASE_URL` | **Transaction pooler** (Supavisor) | `6543` | The Next.js app at runtime (`lib/db/client.ts`) |
| `DIRECT_URL` | **Direct** Postgres | `5432` | Migrations (`npm run db:migrate`), Drizzle Studio, Firestore backfill |

Do **not** put these in `NEXT_PUBLIC_*` variables. They are server secrets.

---

## Step 1 — Create a Supabase account and project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**.
3. Choose an **organization** (create one if prompted).
4. Fill in:
   - **Project name** — e.g. `eventclaim-prod`
   - **Database password** — generate a strong password and **save it** (you cannot recover it later; you can only reset it).
   - **Region** — pick one close to where you deploy (e.g. same region as Vercel).
5. Click **Create new project** and wait until the project finishes provisioning (usually 1–2 minutes).

---

## Step 2 — Copy the connection strings

1. In the Supabase dashboard, open your project.
2. Go to **Project Settings** (gear icon) → **Database**.
3. Scroll to **Connection string** (or **Connection pooling**).

### 2a — `DIRECT_URL` (port 5432)

1. Select **URI** format.
2. Choose **Direct connection** (not pooler).
3. Copy the string. It looks like:

   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

4. Replace `[YOUR-PASSWORD]` with the database password from Step 1.
5. This value becomes `DIRECT_URL`.

### 2b — `DATABASE_URL` (port 6543, transaction pooler)

1. Still under **Database**, open **Connection pooling** (Supavisor).
2. Select **Transaction** mode (required for serverless / short-lived connections).
3. Copy the **URI**. It looks like:

   ```
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```

4. Replace `[YOUR-PASSWORD]` with the same database password.
5. This value becomes `DATABASE_URL`.

**Tip:** If the UI shows `?pgbouncer=true` on the pooler URL, keep it. The app already sets `prepare: false` in `lib/db/client.ts`, which is required for the transaction pooler.

---

## Step 3 — Add environment variables locally

1. In the project root, create `.env.local` (it is gitignored — never commit secrets):

   ```bash
   cp .env.local.example .env.local   # if you have an example file
   # or create .env.local manually
   ```

2. Add at minimum these two lines (plus your existing Firebase / EmailJS vars):

   ```env
   # Supabase Postgres — runtime (transaction pooler, port 6543)
   DATABASE_URL=postgresql://postgres.xxxxx:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres

   # Supabase Postgres — migrations & backfill (direct, port 5432)
   DIRECT_URL=postgresql://postgres.xxxxx:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
   ```

3. If your password contains special characters (`@`, `#`, `%`, etc.), **URL-encode** them in the connection string. Example: `@` → `%40`.

4. Keep all other required vars from the main README (`FIREBASE_*`, `EMAILJS_*`, etc.).

---

## Step 4 — Install dependencies

From the repo root:

```bash
npm install
```

---

## Step 5 — Run database migrations

Migrations live in `drizzle/` and create:

- 7 tables (`events`, `attendees`, `coupons`, `coupon_links`, `grants`, `email_logs`, `audit_logs`)
- Counter-maintenance triggers on `grants` and `coupon_links`
- Row-level security (RLS) with a deny-all posture

Run:

```bash
npm run db:migrate
```

This uses `DIRECT_URL` via `drizzle.config.ts`.

**Expected result:** command completes without errors; in Supabase **Table Editor** you should see all seven tables.

### If migration fails

| Error | Fix |
|-------|-----|
| `Set DIRECT_URL before running drizzle-kit` | Add `DIRECT_URL` to `.env.local` and re-run. |
| `password authentication failed` | Wrong password or special chars not URL-encoded. |
| `connection refused` | Project still provisioning, or wrong host/port. |
| `ENETUNREACH` / timeout | Check firewall/VPN; try direct connection from your machine. |

---

## Step 6 — Verify the connection (optional)

### Option A — Drizzle Studio

```bash
npm run db:studio
```

Opens a browser UI connected to `DIRECT_URL`. You should see the migrated tables.

### Option B — Sandbox integration test (local Postgres or Supabase)

If you have a scratch database (local Postgres or a dev Supabase project):

```bash
# Temporarily stub server-only for standalone script execution (test only)
# Then run with your DATABASE_URL / DIRECT_URL set:
npx tsx scripts/sandbox-integration-test.ts
```

See `scripts/sandbox-integration-test.ts` for details. All 20 checks should pass.

### Option C — Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Firebase, create an event, and confirm data appears in Supabase **Table Editor** → `events`.

---

## Step 7 — Migrate existing Firestore data (optional)

Skip this if you are starting fresh with no Firestore data.

1. Ensure `FIREBASE_SERVICE_ACCOUNT` (or Firebase Admin credentials) is set so the script can read Firestore.
2. Ensure `DIRECT_URL` points at the **target** Supabase database.
3. Dry-run first (counts only, no writes):

   ```bash
   npx tsx scripts/migrate-firestore-to-supabase.ts --verify-only
   ```

4. Run the backfill:

   ```bash
   npm run db:backfill
   ```

The script is **idempotent** (`ON CONFLICT DO NOTHING`) — safe to re-run after a partial failure.

---

## Step 8 — Deploy to production (e.g. Vercel)

1. Push your branch and merge after review.
2. In your hosting provider, add **environment variables** for the production deployment:
   - `DATABASE_URL` — transaction pooler (`6543`)
   - `DIRECT_URL` — direct connection (`5432`) — needed if you run migrations from CI or manually against prod
   - All existing Firebase / EmailJS vars
3. Run migrations against production **once** before or right after first deploy:

   ```bash
   DIRECT_URL="postgresql://..." npm run db:migrate
   ```

   Run this from a trusted machine or CI job with network access to Supabase — not from the browser.

4. Set `APP_BASE_URL` to your production URL so claim links in emails are correct.

---

## Security notes

### How this app uses Supabase

- **Direct Postgres** via Drizzle + `postgres.js` (`lib/db/client.ts`, guarded by `import "server-only"`).
- **Not** Supabase Auth, **not** the anon/service-role REST keys for data access in the app code.

### RLS and the Data API

Migrations enable **RLS on every table with zero policies** and revoke `anon` / `authenticated` grants. That means:

- Supabase’s PostgREST / Data API cannot read or write app tables even if left enabled.
- Only connections using the database password (your `DATABASE_URL` / `DIRECT_URL`) can access data.

You do **not** need to expose `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for this project.

### Protecting credentials

- Never commit `.env.local` or paste connection strings into client-side code.
- Rotate the database password in Supabase if a secret is leaked: **Project Settings → Database → Reset database password**, then update `DATABASE_URL` and `DIRECT_URL` everywhere.

---

## Quick reference — npm scripts

| Command | Purpose |
|---------|---------|
| `npm run db:migrate` | Apply pending SQL migrations to `DIRECT_URL` |
| `npm run db:generate` | Generate a new migration after editing `lib/db/schema.ts` |
| `npm run db:studio` | Browse/edit data in Drizzle Studio |
| `npm run db:backfill` | One-time Firestore → Supabase copy |

---

## Troubleshooting in production

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `DATABASE_URL is not set` | Missing env var in hosting | Add `DATABASE_URL` in Vercel/hosting settings. |
| `prepared statement already exists` | Pooler used with `prepare: true` | Already fixed in `lib/db/client.ts` (`prepare: false`). Redeploy latest code. |
| App works locally, fails in prod | Prod env still points at Firestore or wrong DB | Confirm prod `DATABASE_URL` is the Supabase pooler string. |
| Migrations OK but empty app | Connected to wrong project/database | Compare project ref in URL with Supabase dashboard. |
| Slow cold starts | Normal for serverless + pooler | Transaction pooler (`6543`) is the correct choice for Vercel. |

---

## Related files in this repo

| File | Role |
|------|------|
| `lib/db/client.ts` | Runtime DB client (`DATABASE_URL`, pooler) |
| `lib/db/schema.ts` | Drizzle table definitions |
| `drizzle.config.ts` | Drizzle Kit config (`DIRECT_URL`) |
| `drizzle/*.sql` | Versioned migrations |
| `scripts/migrate-firestore-to-supabase.ts` | Firestore backfill |
| `README.md` | Full env var list and app overview |
