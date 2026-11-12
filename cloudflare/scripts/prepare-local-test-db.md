# Local D1 test preparation (no Cloudflare account, no real data modified)

```bash
# 1) Create/apply schema to LOCAL D1 only (persisted under cloudflare/.wrangler/state, gitignored)
cd earthone
npx wrangler d1 execute earthone --local --persist-to cloudflare/.wrangler/state \
  --config cloudflare/wrangler.toml --file cloudflare/migrations/0001_initial.sql

# 2) Import must read from a COPY of server_data.json / books, never the originals in-place.
#    Keep test DB isolated; do not point production or shared env at it.
```

Notes:
- `server_data.json`, `server_data/`, `discovery.db*`, `.env` are gitignored and must remain untouched.
- Any import script should accept `--input <copy-path>` and `--output-db <local-db>` and write reports (counts/checksums) without mutating source.
