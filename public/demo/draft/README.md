# Demo video drafts

Previous portal walkthrough renders kept for review. The live dashboard player
always uses `../eventclaim-portal-demo.mp4`.

| File | Notes |
|------|--------|
| `eventclaim-portal-demo-v1-initial.mp4` | First narrated cut |
| `eventclaim-portal-demo-v2-setup-first.mp4` | Setup-first + burned-in captions |
| `eventclaim-portal-demo-v3-attendees-offers.mp4` | Rebalanced Attendees/Offers focus |
| `eventclaim-portal-demo-v4-pre-enterprise.mp4` | Last cut before enterprise rebuild (had loading-state frames) |
| Live file | Title cards, strict content waits, temp users beat, soft VTT |

When replacing `../eventclaim-portal-demo.mp4`, copy the previous live file into this folder first (do not delete drafts). The builder archives automatically with a dated filename.

## Regenerating

Follow the project skill: `.cursor/skills/portal-demo-video/SKILL.md`

1. Seed local DB: `npx tsx scripts/seed-demo-data.ts` (requires `DATABASE_URL` / `DIRECT_URL`)
2. Save an admin Playwright session (Google login): `node scripts/portal-demo/save-storage-state.cjs`
3. Rebuild: `node scripts/portal-demo/build-portal-demo.cjs`
