# Demo video drafts

Previous portal walkthrough renders kept for review. The live dashboard player
always uses `../eventclaim-portal-demo.mp4`.

| File | Notes |
|------|--------|
| `eventclaim-portal-demo-v1-initial.mp4` | First narrated cut |
| `eventclaim-portal-demo-v2-setup-first.mp4` | Setup-first + burned-in captions |
| `eventclaim-portal-demo-v3-attendees-offers.mp4` | Rebalanced Attendees/Offers focus |
| `eventclaim-portal-demo-v4-pre-enterprise.mp4` | Last cut before enterprise rebuild (had loading-state frames) |
| `eventclaim-portal-demo-archive-2026-08-06.mp4` | Pre UI-refresh cut (overview skeleton leak / Jenny voice) |
| `eventclaim-portal-demo-archive-2026-08-06-1.mp4` | Pre probe-first rebuild (dashboard/audit skeleton; soft encode) |
| `eventclaim-portal-demo-archive-2026-08-07.mp4` | Pre Cursor-logo title cards |
| `eventclaim-portal-demo-archive-2026-08-07-2.mp4` | Logo titles only (pre offline focus-zoom pass) |
| `eventclaim-portal-demo-archive-2026-08-07-3.mp4` | Broad focus pass before single-target trim |
| `eventclaim-portal-demo-archive-2026-08-07-4.mp4` | Pre-1080p rebuild (1280×800) |
| `eventclaim-portal-demo-archive-2026-08-07-5.mp4` | 1080p with top/bottom crop (header/footer clipped) |
| Live file | **1920×1080** fit+pad (no crop); Cursor logo title/end; focus on Auto-send, actions, temp-users |

When replacing `../eventclaim-portal-demo.mp4`, copy the previous live file into this folder first (do not delete drafts). The builder archives automatically with a dated filename.

## Regenerating

Follow the project skill: `.cursor/skills/portal-demo-video/SKILL.md`

1. Seed local DB: `npx tsx scripts/seed-demo-data.ts` (requires `DATABASE_URL` / `DIRECT_URL`)
2. Save an admin Playwright session (Google login): `node scripts/portal-demo/save-storage-state.cjs`
3. Probe first: `DEMO_PROBE_ONLY=1 node scripts/portal-demo/build-portal-demo.cjs`
4. Rebuild: `node scripts/portal-demo/build-portal-demo.cjs`

Focused beats use `focus: { selector, zoom }` in `SECTIONS` plus `data-demo-focus` markers in the admin UI. Title/end cards include the Cursor logo from `public/partner-logos/cursor_logo.svg`.
