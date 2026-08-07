---
name: portal-demo-video
description: Rebuild or update the EventClaim portal demo video (Watch demo). Use when adding a feature beat to the walkthrough, fixing captions/sync/loading frames, or regenerating public/demo/eventclaim-portal-demo.mp4.
---

# Portal demo video

## Trigger

Use this skill when asked to:

- Update or rebuild the portal demo video
- Add a new product feature to the Watch demo walkthrough
- Fix caption sync, fullscreen captions, or loading-state frames in the demo
- Add or tune focus zoom / spotlight on walkthrough beats

## Keep

- `public/demo/` (including `public/demo/draft/`)
- Watch demo UI:
  - Sidebar entry above Sign Out (`components/admin-nav.tsx` via `components/watch-demo-dialog.tsx`)
  - Dashboard header button (same shared dialog)
  - Player: `components/demo-video-player.tsx`
- Seed helper: `scripts/seed-demo-data.ts`
- Focus helpers: `scripts/portal-demo/focus-zoom.cjs`

Do **not** reintroduce temporary product demo auth (`Continue as demo` / `DEMO_AUTH_*`).

## Prerequisites

1. Postgres with migrations applied; `DATABASE_URL` / `DIRECT_URL` set
2. App running at `DEMO_BASE_URL` (default `http://127.0.0.1:3000`)
3. Tools: `ffmpeg`, `ffprobe`, `edge-tts` (`pip install --user edge-tts`), Playwright Chromium
4. Admin session for recording (Google sign-in):
   ```bash
   cd scripts/portal-demo
   npm init -y && npm i playwright@1.52.0 && npx playwright install chromium
   DEMO_BASE_URL=http://127.0.0.1:3000 node save-storage-state.cjs
   ```
   Completes Google sign-in once; writes gitignored `storageState.json`.
   Do **not** reintroduce product demo login (`Continue as demo` / `DEMO_AUTH_*`).

## Pipeline

```bash
# 1. Seed demo event/attendees/offers (draft status so Create temp users is available)
npx tsx scripts/seed-demo-data.ts

# 2. Ensure app is up and storageState.json exists

# 3. Probe-only first (recommended) — review PNGs before shipping
DEMO_PROBE_ONLY=1 node scripts/portal-demo/build-portal-demo.cjs
# Inspect /tmp/demo-video/build/probes/*.png and /opt/cursor/artifacts/demo-probes/

# 4. Full build
node scripts/portal-demo/build-portal-demo.cjs
```

What the builder does:

1. Per-section `edge-tts` (`en-US-AvaNeural`, `+0%` by default) → concat narration + sentence-weighted VTT
2. **Static sections:** Playwright screenshot PNG → ffmpeg still-hold or focus-zoom (sharp UI text)
3. **Interactive sections only** (`scroll-config`, `autosend`, `scroll-attendees`, `temp-users`): `recordVideo`, ready-pad, accurate output seek trim, optional focus-zoom
4. Strict **main-scoped** content waits + auto-fail if skeleton/spinner visible or required strings missing
5. Encode with CRF 14 + ~4Mbps floor (readable UI text)
6. Title/end cards via ffmpeg with **Cursor logo** overlay (`public/partner-logos/cursor_logo.svg`) — no login chrome
7. Archives previous live mp4/vtt into `public/demo/draft/` then writes:
   - `public/demo/eventclaim-portal-demo.mp4`
   - `public/demo/eventclaim-portal-demo.vtt`

## Adding a feature beat

1. Edit `SECTIONS` in `scripts/portal-demo/build-portal-demo.cjs`
2. Add `{ id, route, text, wait?, interact?, kind?, focus? }`
3. If needed, extend `waitForSection` / `interact` / `REQUIRED_MAIN_TEXT` with a stable selector wait
4. For focus: only when narration points at **one** control/region on a busy page (not whole-page beats, not Settings / Setup guide). Add `data-demo-focus="…"` on that target, then:
   ```js
   focus: {
     selector: '[data-demo-focus="…"]',
     zoom: "tight" | "medium",
     afterInteractSelector?, // e.g. dialog after temp-users
     expandOffer?,           // e.g. "Cursor Credits" to reveal inventory
   }
   ```
   Current focused beats: Auto-send card, attendee row actions, temp-users dialog.
5. Keep narration concise; Import stays brief; Attendees / Partner Offers / new features get more time
6. Run `DEMO_PROBE_ONLY=1` and visually confirm probes (spotlight framing), then full rebuild before committing

### Focus motion contract

Focused beats use `scripts/portal-demo/focus-zoom.cjs`:

1. Playwright **spotlight** (ring + dim) with ~0.4s fade-in — one target only
2. ffmpeg **Ken Burns**: Establish → smoothstep zoom+pan (~1.6–1.8s, capped) → settle hold
3. Encode at **30 fps**, **2× oversample** then `scale=…:flags=lanczos` (not soft linear zoompan alone)
4. Prefer `tight` for a single control; `medium` for a dialog/card; never clip labels
5. Skip focus on Settings, Setup guide, and other full-page overview beats

### Wait keys already supported

`settings`, `guide`, `dashboard`, `events`, `overview`, `import`, `attendees`, `coupons`, `coupon-detail`, `audit`

### Interact keys already supported

`scroll-config`, `autosend`, `scroll-attendees`, `temp-users`

## Quality gates

- No skeleton (`.animate-pulse`) or spinner (`.animate-spin`) in `main` — builder throws
- Probe PNGs written per section; review dashboard/audit/overview/settings/attendees **and every focused beat** before shipping
- Scrub focused clips: Establish → Zoom → Hold — no linear snap, no soft text at settle, no clipped labels, no spotlight pop
- Title/end cards show sharp Cursor logo above EventClaim (welcome + close)
- Soft VTT (not huge burned-in captions); player uses native `<track>` for fullscreen sync
- Video and audio durations match (±0.2s)
- Captions default off in the player; download disabled
- Do not open Watch demo during recording (empty self-referential player)
- PNG holds for static beats; video only for interactions; focus-zoom allowed on both
- Encode: CRF 14 + bitrate floor (~4M)

## Output checklist

- [ ] Probe-only pass reviewed (no skeletons; spotlight framing OK)
- [ ] Focus zoom scrubbed on key beats (settings, dashboard, overview, autosend, attendees, offers, audit)
- [ ] Title/end cards show Cursor logo
- [ ] Previous live file archived under `public/demo/draft/`
- [ ] Live mp4 + vtt updated
- [ ] Sample frames verified (settings, dashboard, audit, attendees, overview)
- [ ] Draft README note updated if a new archive name was introduced
