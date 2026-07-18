# EventClaim

**Cursor Community — Event Coupon Distribution Platform**

Web app for distributing Cursor credit coupons to event attendees: import attendees and coupon links, auto-assign coupons, send claim emails, track claims, and audit admin activity.

## Features

- **Events** — Create events (name, slug, date, Notion guide URL) with `draft`, `active`, or `completed` status.
- **CSV import** — Import checked-in attendees from a [Luma](https://lu.ma) export; import coupon URLs (one per line or single-column CSV).
- **Coupon assignment** — Automatically pairs available coupons with attendees on import (Firestore transactions).
- **Email delivery** — Sends HTML claim emails via [EmailJS](https://www.emailjs.com/) with unique `/claim/[token]` links.
- **Attendee management** — Search, filter, resend failed emails, and view per-event stats.
- **Public claim flow** — `GET /claim/[token]` marks the coupon claimed and redirects to the coupon URL (idempotent).
- **Status lookup** — `/check-status` lets attendees look up email/claim status by registered email.
- **Audit logs** — Admin actions (imports, assignments, emails, claims) are recorded in Firestore.
- **Attendee Confirmation Calling** — A standalone module (`/confirmations`) for uploading a CSV of approved attendees, creating volunteers, evenly distributing attendees across volunteers for follow-up calls, and letting each volunteer manage their assigned attendees' call status via a unique link + 4-digit PIN.

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router), React 19, TypeScript
- [Tailwind CSS](https://tailwindcss.com) 4, [Radix UI](https://www.radix-ui.com/) + shadcn-style components
- [Firebase](https://firebase.google.com/) — Firestore, Firebase Auth (Google sign-in), Firebase Admin (session cookies)
- [EmailJS](https://www.emailjs.com/) — transactional email API
- [Papa Parse](https://www.papaparse.com/) + [Zod](https://zod.dev/) — CSV parsing and validation

## Prerequisites

- Node.js 20+
- A Firebase project with **Firestore**, **Authentication** (Google provider enabled), and a **service account** key for Admin SDK / session cookies
- An EmailJS account with a service, template, and API keys configured for HTML email (`message_html` template param)

Restrict who can sign in via Firebase Authentication (e.g. authorized Google accounts). The app does not implement an in-code admin email allowlist beyond a valid Firebase session.

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
| `FIREBASE_SERVICE_ACCOUNT` | Yes (local admin) | Full service account JSON as a **single-line** string. Required for session cookie creation/verification. Without it, sign-in succeeds in the client but server sessions fail. |
| `EMAILJS_SERVICE_ID` | Yes | EmailJS service ID |
| `EMAILJS_TEMPLATE_ID` | Yes | EmailJS template ID |
| `EMAILJS_PUBLIC_KEY` | Yes | EmailJS public key |
| `EMAILJS_PRIVATE_KEY` | Yes | EmailJS private key (server-side sends) |
| `EMAILJS_MONTHLY_QUOTA` | No | Monthly EmailJS send limit for quota display (default: `200`) |
| `APP_BASE_URL` | No | Public base URL for claim links in emails and volunteer confirmation links (default: `http://localhost:3000`) |
| `CONFIRMATION_SESSION_SECRET` | Yes (Confirmations module) | Secret used to HMAC-sign the volunteer session cookie for `/volunteer/[token]`. Falls back to an insecure development value with a warning if unset — set a strong random value in production. |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Run the production server (after `build`) |
| `npm run lint` | Run ESLint |

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
| `/confirmations` | Confirmation calling dashboard — stats, CSV upload, "Assign Attendees" |
| `/confirmations/volunteers` | Manage volunteers, copy their link + PIN, reset PIN |
| `/confirmations/attendees` | Full attendee table with status/volunteer/team filters and manual overrides |
| `/confirmations/teams` | Review whole teams at once — lead, members, missing teammates, and fuzzy-match fixes |
| `/confirmations/logs` | Confirmation module audit log viewer |

### Volunteer-facing (own token + PIN + cookie auth, not Firebase Auth)

| Path | Description |
|------|-------------|
| `/volunteer/[token]` | PIN entry, then that volunteer's assigned attendee list; clicking an attendee opens a status-update dialog (no page navigation) |

### API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/session` | Exchange Firebase `idToken` for session cookie |
| `POST` | `/api/auth/logout` | Clear session cookie |

## Data model (Firestore)

Top-level collections:

- `events` — event metadata
- `events/{eventId}/attendees` — attendee records, claim tokens, email/claim status
- `events/{eventId}/coupons` — coupon URLs and assignment/claim status
- `claimTokens` — maps token → `eventId` + `attendeeId`
- `emailLogs` — send/resend history
- `auditLogs` — admin action audit trail
- `confirmationAttendees` — attendees uploaded for confirmation calling, their status, team signal (`teamIntent`), resolved team (`teamKey`/`teamRole`/`inPool`), and volunteer assignment (decoupled from `events`)
- `confirmationTeams` — teams computed by the team resolver (lead, members, missing/expected teammates, review issues, fuzzy-match suggestions), recomputed each time "Resolve Teams" runs
- `confirmationVolunteers` — volunteers, their unique token/PIN, and active state
- `confirmationAuditLogs` — audit trail for the Confirmations module (imports, assignments, PIN resets, status updates, team resolution)

### Team formation

Each attendee's ticket type (from `ticket_name` / `ticket` / `ticket_type`, e.g. "Create a Team", "Team Member", "Join a Team") plus the CSV's team-email question are parsed into a `teamIntent` (kind: lead/member/individual/ambiguous, referenced emails, and an answer-quality flag) at upload time. The team-email column is chosen by email density (so a yes/no "Are you on a team?" field doesn't shadow the real question). If the ticket label is generic, kind is inferred from how many emails they listed (2+ → lead, 1 → ambiguous). Actual team *formation* is a separate step (`lib/confirmation/team-resolver.ts`, triggered after upload / Assign and re-runnable from `/confirmations/teams`): it recovers emails from stored `extra` fields when needed, builds a graph of who-references-whom across **every** attendee, finds connected components via union-find, picks a lead per component, and flags review issues. Re-uploading the same emails refreshes team signals without wiping call status or assignments.

## Import formats

**Attendees (Luma CSV):** Uses standard Luma export columns (`email`, `name` or `first_name`/`last_name`, `checked_in_at`). By default only checked-in rows are imported.

**Coupons:** One valid URL per line, or a CSV with a header such as `coupon_link`. Duplicate URLs in a file are skipped.

Re-importing the same attendee email or coupon link for an event is idempotent (deterministic document IDs).

**Confirmation attendees:** Tolerant of arbitrary CSV columns (e.g. a Luma "approved attendees" export). Requires `email` and either `name` or `first_name`/`last_name`; `phone`/`phone_number` is mapped to the attendee's phone number. By default only rows with `approval_status` = `approved` (or no `approval_status` column at all) are imported — toggle this off on the upload form to import every row. Ticket + team-email columns drive team formation. Every other column is preserved in `extra`. Re-uploading the same email refreshes name/phone/extra/team signals without resetting call status or volunteer assignment.

## Authentication

1. Admin signs in with Google (Firebase client SDK).
2. Client posts the Firebase ID token to `/api/auth/session`.
3. Server creates a Firebase session cookie (`eventclaim_session`, 5-day expiry).
4. `(admin)` layout routes call `getSession()` and redirect to `/login` if missing.

### Volunteer authentication (Confirmations module)

Volunteers are not Firebase Auth users. Each volunteer gets a unique shareable link (`/volunteer/[token]`) and a 4-digit PIN, both shown/copyable on `/confirmations/volunteers`. Entering the correct PIN once sets a self-signed, HMAC-signed httpOnly cookie (`confirm_volunteer_session`, scoped to `/volunteer`, ~30-day expiry) so the volunteer isn't asked for the PIN again until it expires or the admin resets their PIN. Ten incorrect PIN attempts lock that volunteer's link for 15 minutes. Every server action re-validates that the session cookie's volunteer ID matches the token in the URL, so a volunteer can only ever see/edit their own assigned attendees.

## Deployment

Standard Next.js deployment (e.g. [Vercel](https://vercel.com)) works. Set all environment variables in the hosting provider, including `APP_BASE_URL` for production claim links. Ensure `FIREBASE_SERVICE_ACCOUNT` (or equivalent credentials) is available to the server runtime.

There is no project-specific `vercel.json` or Docker configuration in this repository.

## Testing

No automated test suite is configured in this repo.

## Project notes

- This project uses a newer Next.js release; see `AGENTS.md` and `node_modules/next/dist/docs/` for framework-specific APIs and conventions.
- Generated `.next` output and local caches should not be committed.
