# STRANGER

Anonymous one-to-one **text and video chat** with random strangers, inspired by Omegle and built for
2026 expectations: interest-based matching, instant Next/Stop, report/block/ban moderation, spam
controls, an adults-only gate, a privacy-first data model (no chat content is ever stored) and a
horizontally scalable matchmaking core.

| Layer       | Stack                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Web client  | Vite 8, React 19, TypeScript, hand-written CSS (dark, responsive, WCAG-minded)                        |
| Server      | Node 22+, Fastify 5 (HTTP), `ws` (WebSocket), pino                                                    |
| Realtime    | WebSocket for signaling + messaging, WebRTC (peer-to-peer SRTP) for media, STUN/TURN via coturn       |
| State       | Redis (matchmaking queues, presence, pub/sub relay, rate-limit counters, ban cache)                   |
| Persistence | PostgreSQL 17 (reports, bans, blocks, moderation log — **no messages, no media**)                     |
| Tests       | Vitest (unit + integration on real Redis/Postgres), Playwright (two real Chrome contexts, fake media) |

## Quick start (local)

```bash
# prerequisites: Node 22+, PostgreSQL 17, Redis 7/8 running locally (see docs/SETUP.md)
npm ci
cp .env.example .env                # then set IDENTITY_SECRET and ADMIN_TOKEN (openssl rand -hex 32)
npm run db:create && npm run db:migrate
npm run dev                         # server on :8080, web on :5173 (proxies /api and /ws)
```

Open http://localhost:5173 in two browser windows (or one normal + one private window) to chat with yourself.

## Scripts

| Command                                                       | What it does                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`                                                 | server (tsx watch) + web (Vite) together                                      |
| `npm run build`                                               | protocol → server (`tsc`) → web (`vite build`)                                |
| `npm test`                                                    | protocol + server + web unit/integration tests (needs local Redis + Postgres) |
| `npm run test:e2e`                                            | Playwright end-to-end suite in Chrome (starts its own server + Vite)          |
| `npm run typecheck` / `npm run lint` / `npm run format:check` | static checks                                                                 |
| `npm run db:create` / `npm run db:migrate`                    | create the database / apply `apps/server/migrations/*.sql`                    |

## Repository layout

```
apps/server     Fastify + ws server, Redis matchmaker, moderation services, SQL migrations, tests
apps/web        React client (landing, consent gate, chat, video, report dialog, admin console)
packages/protocol  zod schemas + types for every WebSocket frame (shared by all packages)
e2e             Playwright tests
infra           Dockerfiles, docker-compose, nginx, coturn
docs            ARCHITECTURE, PLAN, SETUP, DEPLOYMENT, PROTOCOL, SAFETY, EXTERNAL-SERVICES
```

## Live

| What | URL |
|---|---|
| Full app on Render (site + API + WebSocket) | https://stranger-3ak5.onrender.com |
| SEO landing on GitHub Pages (chat connects to the Render backend) | https://sabhckr.github.io/stranger/ |
| Source | https://github.com/sabhckr/stranger |

Render's free tier sleeps after 15 minutes without traffic (first request then takes up to a minute) and its free
Postgres expires 30 days after creation; see docs/DEPLOYMENT.md before relying on it.

## Hosting

- **GitHub Pages** (static landing + client): `.github/workflows/pages.yml`, published on every push to `main`.
- **Render** (API + WebSocket + SPA, Postgres, Redis): `render.yaml` blueprint, one click from the GitHub repo.
- **Docker / VPS**: `infra/` (compose with coturn + nginx) or `STATIC_DIR=apps/web/dist` to serve everything
  from the Node process. Details and the SEO setup in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Status

See [docs/PLAN.md](docs/PLAN.md) for the phase-by-phase checklist and
[docs/EXTERNAL-SERVICES.md](docs/EXTERNAL-SERVICES.md) for everything that still needs credentials,
paid services, legal review or manual operation before a public launch.
