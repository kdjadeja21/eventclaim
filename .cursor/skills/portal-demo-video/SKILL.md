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

## Keep

- `public/demo/` (including `public/demo/draft/`)
- Watch demo UI:
  - Sidebar entry above Sign Out (`components/admin-nav.tsx` via `components/watch-demo-dialog.tsx`)
  - Dashboard header button (same shared dialog)
  - Player: `components/demo-video-player.tsx`
- Seed helper: `scripts/seed-demo-data.ts`

Do **not** reintroduce temporary product demo auth (`Continue as demo` / `DEMO_AUTH_*`).

## Prerequisites

1. Postgres with migrations applied; `DATABASE_URL` / `DIRECT_URL` set
2. App running at `DEMO_BASE_URL` (default `http://127.0.0.1:3000`)
3. Tools: `ffmpeg`, `ffprobe`, `edge-tts` (`pip install --user edge-tts`), Playwright Chromium
4. Admin session for recording — pick one:
   - **Google session (preferred):**
     ```bash
     cd scripts/portal-demo
     npm init -y && npm i playwright@1.52.0 && npx playwright install chromium
     DEMO_BASE_URL=http://127.0.0.1:3000 node save-storage-state.cjs
     ```
     Completes Google sign-in once; writes gitignored `storageState.json`.
   - **Headless recording session (no login UI):** set `PORTAL_DEMO_RECORDING_SECRET` in
     the app env and the builder env to the same value. Cookie is
     `recording:<secret>`; blocked when `VERCEL_ENV=production`. Do **not**
     reintroduce product demo login (`Continue as demo` / `DEMO_AUTH_*`).

## Pipeline

```bash
# 1. Seed demo event/attendees/offers (draft status so Create temp users is available)
npx tsx scripts/seed-demo-data.ts

# 2. Ensure app is up and storageState.json exists (or PORTAL_DEMO_RECORDING_SECRET)

# 3. Build
node scripts/portal-demo/build-portal-demo.cjs
```

What the builder does:

1. Per-section `edge-tts` (`en-US-AvaNeural`, `+0%` by default) → concat narration + sentence-weighted VTT
2. Playwright `recordVideo` (1280×800) per section, ready-pad then trimmed to exact audio duration
3. Strict content waits (overview requires heading + Auto-send + Claim Rate + section nav); throws if skeleton/spinner still visible
4. Title/end cards via ffmpeg (no login chrome)
5. Archives previous live mp4/vtt into `public/demo/draft/` then writes:
   - `public/demo/eventclaim-portal-demo.mp4`
   - `public/demo/eventclaim-portal-demo.vtt`

## Adding a feature beat

1. Edit `SECTIONS` in `scripts/portal-demo/build-portal-demo.cjs`
2. Add `{ id, route, text, wait?, interact?, kind? }`
3. If needed, extend `waitForSection` / `interact` with a stable selector wait
4. Keep narration concise; Import stays brief; Attendees / Partner Offers / new features get more time
5. Rebuild, then spot-check frames (no skeletons) and caption sync before committing

### Wait keys already supported

`settings`, `guide`, `dashboard`, `events`, `overview`, `import`, `attendees`, `coupons`, `coupon-detail`, `audit`

### Interact keys already supported

`scroll-config`, `autosend`, `scroll-attendees`, `temp-users`

## Quality gates

- No skeleton (`.animate-pulse`) or spinner (`.animate-spin`) frames in the final cut
- Title/end cards instead of login UI
- Soft VTT (not huge burned-in captions); player uses native `<track>` for fullscreen sync
- Video and audio durations match (±0.2s)
- Captions default off in the player; download disabled
- Do not open Watch demo during recording (empty self-referential player)

## Output checklist

- [ ] Previous live file archived under `public/demo/draft/`
- [ ] Live mp4 + vtt updated
- [ ] Sample frames verified (settings, dashboard, attendees, any new beat)
- [ ] Draft README note updated if a new archive name was introduced
