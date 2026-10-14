# Deployment

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
