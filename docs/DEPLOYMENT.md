# Deployment

## Fastest path: GitHub + Render (free tiers)

1. **Push to GitHub.** `.github/workflows/pages.yml` publishes the static site to GitHub Pages on every push
   to `main` (enable Pages → Source: _GitHub Actions_ once). Pages hosts only the landing page and the client:
   until a backend is connected it shows a "chat server not connected" notice.
2. **Deploy the backend from the same repo on Render.** In Render choose _New → Blueprint_ and select the
   repository: `render.yaml` creates the web service (API + WebSocket + the built SPA on one origin), a
   Postgres database and a Redis (Key Value) instance, generates `IDENTITY_SECRET`/`ADMIN_TOKEN` and runs
   migrations on each deploy. The site is then fully working at `https://<service>.onrender.com`.
3. **Point the Pages site at it (optional).** Add repository variables `API_BASE=https://<service>.onrender.com`
   and `WS_URL=wss://<service>.onrender.com/ws`, add `https://<owner>.github.io` to `PUBLIC_ORIGINS` on Render
   (or set `SITE_URL`), and re-run the Pages workflow. Or simply use the Render URL as the public site and
   put a custom domain on it (better for SEO: one canonical origin).
4. **Add TURN** (`TURN_URLS` + `TURN_SECRET`, see docs/EXTERNAL-SERVICES.md) so video works behind strict NATs.

Notes on free tiers: Render free web services sleep after inactivity (first request takes ~30 s) and the free
Postgres is time-limited; upgrade before launch. Blueprint field names follow Render's current spec but were
not applied from this machine (no Render account here), so review the first deploy in the Render dashboard.

## Share a test build from your own computer (Cloudflare quick tunnel)

`npm run tunnel` starts a Cloudflare quick tunnel (no account needed), builds the web app for the
tunnel's HTTPS URL and serves site + API + WebSocket from the local server on one origin. The URL
changes on every run, is rate-limited by Cloudflare and is meant for testing with friends or from
phones, not for production. Camera access works because the URL is HTTPS. Stop with Ctrl-C.

## SEO

- `index.html` carries the title/description targeting "stranger chat", "stranger talk", "talk to strangers",
  canonical and Open Graph/Twitter tags, and JSON-LD (`WebSite`, `WebApplication`, `FAQPage`) generated from
  `apps/web/src/seo/faq.ts`, which is the same FAQ shown on the landing page.
- `npm run build -w apps/web` pre-renders the landing page into `dist/index.html` (and `404.html` for Pages),
  and writes `robots.txt` (disallows `/chat` and `/admin`) and `sitemap.xml` for `VITE_SITE_URL`.
- Set `VITE_SITE_URL` to the final public URL (and `VITE_BASE` when hosted under a sub-path) at build time;
  `/chat`, `/admin` and 404 pages set `noindex` at runtime.
- After launch: verify the domain in Google Search Console and Bing Webmaster Tools and submit
  `sitemap.xml`; keep one canonical origin (custom domain) rather than two live copies.

## Reference stack (docker compose)

`infra/docker-compose.yml` runs Postgres, Redis, coturn, the migration job, the server and nginx (SPA +
reverse proxy). It is production-shaped but you still need TLS in front of it.

```bash
cp .env.example .env
# set: IDENTITY_SECRET, ADMIN_TOKEN, POSTGRES_PASSWORD, TURN_SECRET, TURN_EXTERNAL_IP (public IP),
#      PUBLIC_ORIGINS=https://your.domain, TURN_URLS=turn:your.domain:3478?transport=udp,turns:your.domain:5349
docker compose -f infra/docker-compose.yml up -d --build
```

- `web` listens on `${WEB_PORT:-8088}`; terminate TLS with Caddy/Traefik/nginx+certbot and forward to it
  (WebSocket upgrade must be forwarded — any modern proxy does this).
- The server runs with `TRUST_PROXY=true` and reads `X-Forwarded-For` from nginx only.
- `coturn` uses `network_mode: host` because TURN needs real UDP ports (3478, 5349, relay range 49160–49200).
  Open those in the firewall. Mount certificates in `infra/coturn/turnserver.conf` to enable `turns:`.
- Scale the server with `docker compose up -d --scale server=3`: matchmaking, presence and cross-node
  delivery are Redis-backed; nginx round-robins the `server` DNS name.

> The Docker images are built and `docker compose config` is validated in CI (`.github/workflows/ci.yml`).
> They were **not** run on the development machine (no Docker available there), so treat the first
> deployment as a verification step.

## Without Docker

1. `npm ci && npm run build`
2. Run migrations: `DATABASE_URL=… node apps/server/dist/db/migrate.js`
3. Start the server: `NODE_ENV=production … node apps/server/dist/index.js` (use systemd or PM2).
4. Serve `apps/web/dist` from any static host and proxy `/api`, `/ws`, `/healthz`, `/readyz` to the server
   (see `infra/nginx/default.conf.template` for headers and the WebSocket upgrade block). If the SPA is on a
   different origin, build it with `VITE_API_BASE` / `VITE_WS_URL` and list that origin in `PUBLIC_ORIGINS`.

## Production checklist

- `NODE_ENV=production`, 32+ byte `IDENTITY_SECRET` (rotating it invalidates blocks/bans), strong `ADMIN_TOKEN`
  (or leave it empty to disable the admin API entirely).
- `PUBLIC_ORIGINS` set to the exact site origin(s): the WebSocket upgrade rejects other origins.
- TURN configured (`TURN_URLS` + `TURN_SECRET`): without it users behind symmetric NAT or strict firewalls cannot
  connect video. The UI shows a "No TURN relay configured" badge when it is missing.
- Readiness probe: `GET /readyz` (503 until Redis and Postgres answer). Liveness: `GET /healthz`.
- Logs are JSON (pino) on stdout; ship them to your log system. No message content is ever logged.
- Back up Postgres (moderation records only). Redis is ephemeral by design (`--save ''`).
- Report retention: `REPORT_RETENTION_DAYS` (default 90) — the server purges older reports daily.
- Tune `MAX_CONNECTIONS_PER_IP` for CGNAT-heavy regions; `REPORT_AUTOBAN_THRESHOLD/WINDOW/DURATION` for your moderation policy.

## Capacity notes

- One Node process comfortably handles thousands of idle WebSocket sessions; CPU is dominated by JSON
  relay of chat/signaling, which is small. Media never touches the server.
- TURN relay bandwidth is the real cost: budget ~1–2 Mbit/s per relayed video call. Typically 10–20 % of
  calls need relay.
- The matching sweep runs per node every `MATCH_SWEEP_INTERVAL_MS` over that node's waiting tickets; with
  very large waiting pools shard by mode/region or raise the interval.
