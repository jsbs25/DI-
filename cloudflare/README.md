# Cloudflare Backend Migration Scaffold (Zero-Cost, Incremental)

This folder contains **additive, non-breaking** scaffolding to migrate EARTH ONE backend from Node/Express + local fs/sqlite/WS toward Cloudflare (Workers, D1, R2, Durable Objects) **without rewriting or removing existing features**.

## Current status
- **Implemented (no account required):** API inventory baseline (`docs/deploy/10-api-inventory.md`), Worker entry scaffold (`worker/src/index.ts`), CORS/health handlers, 501 pass-through for unmigrated `/api` routes, `wrangler.toml.example`, D1 draft migration, design docs.
- **Blocked without account authorization:** real D1/R2/DO/Workers resources creation, secret configuration, deployment, and public WSS/API validation.
- **Not migrated:** existing Express handlers in `server.ts`, `server/store.ts` persistence, `server/messengerWs.ts` realtime, `server_data/*` live data, LiveKit/calls runtime, discovery sqlite/FTS, uploads/books serving.

## Safety & cost rules
- $0 only: do not enable paid plans, trials, overage, or auto-upgrade features.
- Never commit secrets, `.env`, tokens, account IDs, or user data (`server_data.json`, `server_data/`, uploads, books).
- Never overwrite/delete existing SQLite/JSON/files; migrations must be import-from-copy into isolated test DB/bucket first.
- Preserve API contracts and frontend behavior; migrate route-by-route behind compatibility adapters.

## Local checks (no Cloudflare login needed)
```bash
cd earthone
npx wrangler --version
# Optional local dry-run (uses example config, no deploy):
# npx wrangler dev --config cloudflare/wrangler.toml.example --local
```

## When Cloudflare authorization is available (manual, account holder only)
1. `npx wrangler login` (browser OAuth by account holder; cannot be bypassed).
2. Create resources (verify free plan before each): D1 database, R2 bucket, Worker, Durable Object bindings.
3. Copy `wrangler.toml.example` to `wrangler.toml` locally with real IDs **only in uncommitted/local config or CI secrets**.
4. Apply migrations to a **test** D1 database, import copied data, validate, then (after approval) plan production cutover.
5. Deploy worker: `npx wrangler deploy --config cloudflare/wrangler.toml`.
6. Set frontend `VITE_API_BASE` (GitHub Pages workflow/vars) to deployed Worker URL and validate CORS/HTTPS/auth/WSS.

## Architecture intent
- **Workers**: stateless API adapter layer, gradually delegating to existing logic equivalents.
- **D1**: relational state (users/auth/sessions/social/messenger metadata/calls) migrated from `server_data.json` with ID/timestamp preservation.
- **R2**: private-by-default object storage for avatars/attachments/book content; access only via authorized API/short-lived signed logic (no public private files).
- **Durable Objects**: per-conversation/user realtime coordination for `/ws` (presence, typing, fanout, ordering/idempotency) replacing in-memory `messengerWs.ts`.
- **Frontend**: keep `https://jsbs25.github.io/DI-/` on Pages, point to Worker API when ready.
