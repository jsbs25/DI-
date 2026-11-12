# D1 Migrations (Draft)

- `0001_initial.sql` is a **draft schema** for incremental migration from the current JSON/file store.
- **Do not apply to production data without**: full backup, checksum manifest, dry-run import, count/spot checks, and explicit approval.
- Source of truth today: `server_data.json`, `server_data/books/*.json`, `server_data/uploads/**`, `server_data/discovery.db*`.
- Discovery/search (FTS5, `node:sqlite`) needs a separate compatibility PoC before migration.
- Apply locally (after creating DB): `npx wrangler d1 migrations apply earthone --local --config cloudflare/wrangler.toml`
