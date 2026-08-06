# Remove temporary demo auth

Use this checklist after you are satisfied with the portal demo video.
**Keep** `public/demo/` and the dashboard Watch demo UI.

## Suggested prompt

> Remove all temporary demo auth. Follow `DEMO_AUTH_REMOVE.md`: delete `lib/demo-auth.ts`, `app/api/auth/demo/`, and `DEMO_AUTH_REMOVE.md`; remove every `TEMP_DEMO_AUTH_START`…`END` block from `lib/session.ts` and `app/login/page.tsx`; strip `DEMO_*` from env examples/docs. Keep `public/demo/` (including `public/demo/draft/`) and the dashboard Watch demo UI.

## Manual steps

1. Delete `lib/demo-auth.ts`
2. Delete `app/api/auth/demo/` (entire folder)
3. Delete this file (`DEMO_AUTH_REMOVE.md`)
4. In `lib/session.ts`, remove the import of `@/lib/demo-auth` and every block between `TEMP_DEMO_AUTH_START` and `TEMP_DEMO_AUTH_END`
5. In `app/login/page.tsx`, remove every block between `TEMP_DEMO_AUTH_START` and `TEMP_DEMO_AUTH_END` (demo button + handler + related state)
6. Remove any `DEMO_AUTH_*` / `NEXT_PUBLIC_DEMO_AUTH_ENABLED` lines from local `.env.local` and docs

Do not enable demo auth on Vercel production. Even while present, it is blocked when `VERCEL_ENV=production`.
