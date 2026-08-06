# Demo video drafts

Previous portal walkthrough renders kept for review. The live dashboard player
always uses `../eventclaim-portal-demo.mp4`.

| File | Notes |
|------|--------|
| `eventclaim-portal-demo-v1-initial.mp4` | First narrated cut |
| `eventclaim-portal-demo-v2-setup-first.mp4` | Setup-first + burned-in captions |
| `eventclaim-portal-demo-v3-attendees-offers.mp4` | Rebalanced Attendees/Offers focus |
| `eventclaim-portal-demo-v4-pre-enterprise.mp4` | Last cut before enterprise rebuild (had loading-state frames) |
| Live file (v7) | Title cards, strict content waits, temp users beat, soft VTT |

When replacing `../eventclaim-portal-demo.mp4`, copy the previous live file into this folder first (do not delete drafts).

## Regenerating

1. Seed local DB: `npx tsx scripts/seed-demo-data.ts` (requires `DATABASE_URL` / `DIRECT_URL`)
2. Run the app with demo auth enabled (see `DEMO_AUTH_REMOVE.md`)
3. Rebuild with the local Playwright/ffmpeg pipeline (recording scripts live under `/tmp/demo-video/` during agent runs)
