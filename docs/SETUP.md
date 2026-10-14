# Local setup

## Prerequisites

- **Node.js 22+** (developed on 26.x) and npm 10+.
- **PostgreSQL 17** reachable at `DATABASE_URL` (default `postgres://localhost:5432/stranger`).
- **Redis 7+** reachable at `REDIS_URL` (default `redis://127.0.0.1:6379`).
- **Google Chrome** for the end-to-end suite (Playwright uses the installed Chrome via `channel: 'chrome'`;
  set `PLAYWRIGHT_CHANNEL=chromium` and run `npx playwright install chromium` to use a downloaded browser).

macOS with Homebrew:

```bash
brew install postgresql@17 redis
LC_ALL=en_US.UTF-8 pg_ctl -D /opt/homebrew/var/postgresql@17 start   # or: brew services start postgresql@17
redis-server --daemonize yes                                           # or: brew services start redis
```

## Install and configure

```bash
npm ci
cp .env.example .env
# edit .env: IDENTITY_SECRET=$(openssl rand -hex 32)  ADMIN_TOKEN=$(openssl rand -hex 32)
npm run db:create      # creates the database named in DATABASE_URL if missing
npm run db:migrate     # applies apps/server/migrations/*.sql once each (tracked in schema_migrations)
```

The server refuses to start while migrations are pending.

## Run

```bash
npm run dev            # both; or npm run dev:server / npm run dev:web
```

- Web: http://localhost:5173 (Vite proxies `/api` and `/ws` to the server on :8080).
- Health: http://localhost:8080/healthz, readiness (Redis + Postgres): http://localhost:8080/readyz.
- Admin console: http://localhost:5173/admin — paste `ADMIN_TOKEN`.

Open the site in two windows to be matched with yourself. Video needs a camera; on `localhost` the
browser treats the page as a secure context, so `getUserMedia` works without HTTPS.

## Tests

```bash
npm test                 # vitest: packages/protocol, apps/server (real Redis db 1 + Postgres stranger_test), apps/web (jsdom)
npm run test:e2e         # Playwright: boots server (Postgres stranger_e2e, Redis db 2) + Vite, drives two Chrome contexts
```

Override test infrastructure with `TEST_DATABASE_URL`, `TEST_REDIS_URL`, `E2E_DATABASE_URL`, `E2E_REDIS_URL`; set
`E2E_API_PORT` (default 8080) when that port is already taken, for example by `npm run tunnel`.
Test databases are created automatically; their tables are truncated between tests. Do not point them at production.

## Environment reference

All variables are documented inline in [`.env.example`](../.env.example). Validation lives in
`apps/server/src/config.ts`; the server prints every invalid variable and exits.
