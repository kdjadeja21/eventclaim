# EventClaim

**Cursor Community — Event Coupon Distribution Platform**

Web app for distributing Cursor credit coupons to event attendees: import attendees and coupon links, auto-assign coupons, send claim emails, track claims, and audit admin activity.

## Features

- **Events** — Create events (name, slug, date, Notion guide URL) with `draft`, `active`, or `completed` status.
- **CSV import** — Import checked-in attendees from a [Luma](https://lu.ma) export; import coupon URLs (one per line or single-column CSV).
- **Coupon assignment** — Automatically pairs available coupons with attendees on import (set-based SQL with `FOR UPDATE SKIP LOCKED`).
- **Email delivery** — Sends HTML claim emails via [EmailJS](https://www.emailjs.com/) with unique `/claim/[token]` links.
- **Attendee management** — Search, filter, resend failed emails, and view per-event stats.
- **Public claim flow** — `GET /claim/[token]` marks the coupon claimed and redirects to the coupon URL (idempotent).
- **Status lookup** — `/check-status` lets attendees look up email/claim status by registered email.
- **Audit logs** — Admin actions (imports, assignments, emails, claims) are recorded in Postgres.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript
- [Tailwind CSS](https://tailwindcss.com) 4, [Radix UI](https://www.radix-ui.com/) + shadcn-style components
- [Supabase Postgres](https://supabase.com/) via [Drizzle ORM](https://orm.drizzle.team/) + [`postgres.js`](https://github.com/porsager/postgres) — all data storage/CRUD (events, attendees, coupons, links, grants, email logs, audit logs)
- [Firebase Auth](https://firebase.google.com/) (Google sign-in) + Firebase Admin (session cookies) — **authentication only**. Firebase Storage is also still used for coupon logo uploads.
- [EmailJS](https://www.emailjs.com/) — transactional email API
- [Papa Parse](https://www.papaparse.com/) + [Zod](https://zod.dev/) — CSV parsing and validation

## Prerequisites

- Node.js 20+
- A Firebase project with **Authentication** (Google provider enabled), **Storage**, and a **service account** key for Admin SDK / session cookies
- A [Supabase](https://supabase.com/) project (or any Postgres 13+ instance) for data storage
- An EmailJS account with a service, template, and API keys configured for HTML email (`message_html` template param)

Restrict who can sign in via Firebase Authentication (e.g. authorized Google accounts). The app does not implement an in-code admin email allowlist beyond a valid Firebase session.

### Database setup (Supabase Postgres)

For a full step-by-step walkthrough (create project, copy connection strings, run migrations, deploy), see **[docs/supabase-setup.md](docs/supabase-setup.md)**.

1. Create a Supabase project. In **Project Settings → Database**, copy the transaction-pooler (Supavisor, port `6543`) connection string into `DATABASE_URL`, and the direct connection (port `5432`) into `DIRECT_URL`.
2. Run the migrations: `npm run db:migrate` (uses `DIRECT_URL`). This creates all 7 tables, the counter-maintenance triggers, and locks the schema down with RLS (see `drizzle/0001_triggers_and_security.sql`).
3. In Supabase's **API settings**, you can leave the Data API (PostgREST) on or off — either way, every table has RLS enabled with zero policies and anon/authenticated grants revoked, so the REST API cannot read or write anything. The app talks to Postgres directly over `postgres.js`, bypassing PostgREST entirely.
4. If migrating from an existing Firestore-backed deployment, run `npm run db:backfill` once (reads via the Firebase Admin SDK, writes to `DIRECT_URL`, idempotent — safe to re-run). Add `--verify-only` to compare row counts without writing.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home page redirects to `/dashboard`; unauthenticated users are sent to `/login`.

### Environment variables

Create a `.env.local` in the project root:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase web app config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase web app config |
| `FIREBASE_SERVICE_ACCOUNT` | Yes (local admin) | Full service account JSON as a **single-line** string. Required for session cookie creation/verification and Storage uploads. Without it, sign-in succeeds in the client but server sessions fail. |
| `DATABASE_URL` | Yes | Supabase Supavisor **transaction pooler** connection string, port `6543`. Used by the app at runtime — must keep `prepare=false` (already set in `lib/db/client.ts`). |
| `DIRECT_URL` | Yes | Supabase **direct** Postgres connection string, port `5432`. Used only by `drizzle-kit` (migrations/introspection) and the backfill script. |
| `EMAILJS_SERVICE_ID` | Yes | EmailJS service ID |
| `EMAILJS_TEMPLATE_ID` | Yes | EmailJS template ID |
| `EMAILJS_PUBLIC_KEY` | Yes | EmailJS public key |
| `EMAILJS_PRIVATE_KEY` | Yes | EmailJS private key (server-side sends) |
| `EMAILJS_MONTHLY_QUOTA` | No | Monthly EmailJS send limit for quota display (default: `200`) |
| `APP_BASE_URL` | No | Public base URL for claim links in emails (default: `http://localhost:3000`) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Run the production server (after `build`) |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate a new SQL migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations in `drizzle/` to `DIRECT_URL` |
| `npm run db:studio` | Open Drizzle Studio against `DIRECT_URL` |
| `npm run db:backfill` | One-time Firestore → Supabase data backfill (see `scripts/migrate-firestore-to-supabase.ts`) |

## Routes

### Public

| Path | Description |
|------|-------------|
| `/login` | Google sign-in; creates an HTTP-only session via `POST /api/auth/session` |
| `/check-status` | Attendee self-service status lookup by email |
| `/claim/[token]` | Claim link from email; marks claimed and redirects to coupon URL |

### Admin (requires session cookie)

| Path | Description |
|------|-------------|
| `/dashboard` | Overview stats and recent activity |
| `/events` | List events |
| `/events/new` | Create an event |
| `/events/[slug]` | Event detail, stats, and quick links |
| `/events/[slug]/import` | Import Luma attendees and/or coupon CSV |
| `/events/[slug]/attendees` | Manage attendees and email actions |
| `/events/[slug]/preview` | Preview and bulk-send pending emails |
| `/audit` | Audit log viewer |

### API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/session` | Exchange Firebase `idToken` for session cookie |
| `POST` | `/api/auth/logout` | Clear session cookie |

## Data model (Supabase Postgres)

Defined in `lib/db/schema.ts`, migrated via `drizzle/`:

- `events` — event metadata
- `attendees` — attendee records, claim tokens, email/claim status, and denormalized `grant_count` / `claimed_count` / `claimed_any` counters (trigger-maintained)
- `coupons` — coupon definitions, including `link_total` / `link_available` counters for `uniqueLink` coupons (trigger-maintained)
- `coupon_links` — the per-attendee link pool for `uniqueLink` coupons
- `grants` — one row per (attendee, coupon), composite PK, unique on `link_id`
- `email_logs` — send/resend history
- `audit_logs` — admin action audit trail (kept even after the event it references is deleted — not a foreign key)

Foreign keys cascade on delete (deleting an event removes its attendees, coupons, links, and grants in one statement). Postgres triggers (`drizzle/0001_triggers_and_security.sql`) keep the denormalized counters in sync automatically — there's no separate `claimTokens` collection (Postgres can index `claim_token` directly) and no manual drift-repair logic.

Every table has row-level security enabled with zero policies, so the app connects directly over `postgres.js`/Drizzle (see `lib/db/client.ts`, guarded by `import "server-only"`) rather than through Supabase's PostgREST API.

## Import formats

**Attendees (Luma CSV):** Uses standard Luma export columns (`email`, `name` or `first_name`/`last_name`, `checked_in_at`). By default only checked-in rows are imported.

**Coupons:** One valid URL per line, or a CSV with a header such as `coupon_link`. Duplicate URLs in a file are skipped.

Re-importing the same attendee email or coupon link for an event is idempotent (deterministic document IDs).

## Authentication

1. Admin signs in with Google (Firebase client SDK).
2. Client posts the Firebase ID token to `/api/auth/session`.
3. Server creates a Firebase session cookie (`eventclaim_session`, 5-day expiry).
4. `(admin)` layout routes call `getSession()` and redirect to `/login` if missing.

## Deployment

Standard Next.js deployment (e.g. [Vercel](https://vercel.com)) works. Set all environment variables in the hosting provider, including `APP_BASE_URL` for production claim links, and `DATABASE_URL` (pooler, 6543) / `DIRECT_URL` (direct, 5432) for Supabase. Ensure `FIREBASE_SERVICE_ACCOUNT` (or equivalent credentials) is available to the server runtime.

There is no project-specific `vercel.json` or Docker configuration in this repository.

## Testing

No automated test suite is configured in this repo. `scripts/sandbox-integration-test.ts` is a manual end-to-end sandbox script (not wired into CI) that exercises the full data-layer lifecycle — event/attendee/coupon creation, set-based grant assignment, pool exhaustion, concurrent-reservation rejection, claim idempotency, unassignment, stats, and cascade deletes — against a scratch Postgres database.

## Project notes

- This project uses a newer Next.js release; see `AGENTS.md` and `node_modules/next/dist/docs/` for framework-specific APIs and conventions.
- Generated `.next` output and local caches should not be committed.
