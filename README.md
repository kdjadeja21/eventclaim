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

The Luma API key and all EmailJS configuration (service ID, template ID,
public/private keys, monthly quota, and the claim-link base URL) are **not**
read from environment variables. Instead, sign in and open **Settings**
(`/settings`) to enter them — they're encrypted and stored only in that
browser's `localStorage`, and are supplied to server actions at the moment
each button is clicked (Luma sync, send/resend email, import, coupon
create/enable). See [Settings](#settings) below.

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
| `/settings` | Configure the Luma API key and EmailJS credentials for this browser |

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

## Import formats

**Attendees (Luma CSV):** Uses standard Luma export columns (`email`, `name` or `first_name`/`last_name`, `checked_in_at`). By default only checked-in rows are imported.

**Coupons:** One valid URL per line, or a CSV with a header such as `coupon_link`. Duplicate URLs in a file are skipped.

Re-importing the same attendee email or coupon link for an event is idempotent (deterministic document IDs).

## Settings

Rather than relying on a `.env` file for the Luma API key and EmailJS
credentials — which assumes a development background most event organizers
don't have — this app has a **Settings** page (`/settings`, requires an admin
session) where those values are entered directly in the browser.

- Values are encrypted (`AES-GCM`, Web Crypto API) and written **only** to
  that browser's `localStorage`. They are never sent to a server to be
  stored, and no `.env` file is consulted for them.
- Because they live in the browser, not on the server, they don't sync across
  devices/browsers, and clearing site data removes them — re-enter them on
  Settings if that happens.
- Server actions that call the Luma or EmailJS APIs (Luma sync, send/resend
  email, CSV import, coupon create/enable) receive these values as arguments
  from the client at the moment they're invoked; the server itself never
  holds a copy.
- The encryption key is also generated per-browser and stored in
  `localStorage`. This protects the values from being read as plain text
  (e.g. in a `localStorage` backup or a casual look at DevTools) but, like
  any browser-only vault with no login-time passphrase, it isn't a defense
  against script-level XSS in the page.

## Authentication

1. Admin signs in with Google (Firebase client SDK).
2. Client posts the Firebase ID token to `/api/auth/session`.
3. Server creates a Firebase session cookie (`eventclaim_session`, 5-day expiry).
4. `(admin)` layout routes call `getSession()` and redirect to `/login` if missing.

## Deployment

Standard Next.js deployment (e.g. [Vercel](https://vercel.com)) works. Set all environment variables in the hosting provider, including `APP_BASE_URL` for production claim links. Ensure `FIREBASE_SERVICE_ACCOUNT` (or equivalent credentials) is available to the server runtime.

There is no project-specific `vercel.json` or Docker configuration in this repository.

## Testing

No automated test suite is configured in this repo.

## Project notes

- This project uses a newer Next.js release; see `AGENTS.md` and `node_modules/next/dist/docs/` for framework-specific APIs and conventions.
- Generated `.next` output and local caches should not be committed.
