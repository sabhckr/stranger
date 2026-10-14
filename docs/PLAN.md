# STRANGER — Implementation plan

Status legend: `[ ]` not started · `[~]` in progress · `[x]` built and verified · `[!]` blocked / needs external input

Each phase ends with a verification step that must pass before the next phase starts. "Verified" means the
code was executed against real infrastructure (local PostgreSQL 17, Redis 8, Chrome) in this repository,
not reasoned about.

## Phase 0 — Repository, tooling, infrastructure contracts

- [x] Inspect the existing repository (none for STRANGER; created fresh, separate from the PMG portal).
- [x] Verified on 14 Oct 2026: 36 server tests, 5 protocol tests, 13 web tests, 5 Playwright scenarios — all green.
- [x] npm-workspaces monorepo: `apps/server`, `apps/web`, `packages/protocol`, `e2e`, `infra`, `docs`.
- [x] Shared TypeScript config, ESLint + Prettier, `.env.example`, `.nvmrc`, `.editorconfig`.
- [x] Protocol package: zod schemas for every WebSocket message (client→server and server→client).
- [x] Verification: `npm run typecheck` and `npm run lint` pass on the empty skeleton.

## Phase 1 — Server core (text chat end to end over WebSockets)

- [x] Config loader (zod-validated environment), structured logging (pino), graceful shutdown.
- [x] Fastify HTTP: `/healthz`, `/readyz` (checks Redis + Postgres), `/api/ice`, `/api/stats`.
- [x] WebSocket gateway: hello/handshake, session registry, heartbeat, per-session rate limiting.
- [x] Redis matchmaker: interest-aware queue with atomic Lua pairing, FIFO fallback after a timeout,
      exclusion of self, blocked users and the previous partner; multi-node delivery via Redis pub/sub.
- [x] Pair lifecycle: `matched`, `message`, `typing`, `next`, `stop`, `partner_left`, disconnect cleanup.
- [x] Presence: online count aggregated across nodes.
- [x] Spam prevention: token-bucket limits, message length cap, duplicate flood detection, link throttling.
- [x] Verification: vitest integration tests against real Redis (two WS clients match, exchange messages,
      Next re-queues, Stop ends, interests prefer shared tags, blocked pairs never match).

## Phase 2 — Web client (text mode)

- [x] Vite + React 19 + TypeScript app, dark premium responsive UI, no UI framework dependency.
- [x] Consent gate: 18+ self-attestation, terms + privacy acknowledgement, stored locally, sent on hello.
- [x] Landing: mode selection (text / video), interests input, online count.
- [x] Chat screen: message list with `aria-live`, composer, typing indicator, Next / Stop, keyboard support.
- [x] Reconnecting WebSocket client with protocol validation.
- [x] Verification: Vitest component tests; Playwright end-to-end test with two browser contexts
      matching and chatting through the real server.

## Phase 3 — Video chat (WebRTC)

- [x] `/api/ice` issues STUN + time-limited TURN credentials (coturn `use-auth-secret` HMAC scheme).
- [x] Signaling relay over the existing WebSocket (`signal` messages, perfect-negotiation pattern).
- [x] Camera/microphone consent flow, local preview, mute / camera-off controls, device errors surfaced.
- [x] Remote media rendering, connection-state indicator, automatic teardown on Next / Stop / disconnect.
- [x] Verification: Playwright test with Chrome fake media devices confirms a remote track is received
      by both peers; unit tests for TURN credential generation.

## Phase 4 — Safety, moderation, persistence

- [x] PostgreSQL migrations: `reports`, `bans`, `blocks`, `moderation_actions`.
- [x] Report flow (reason, optional details, client-side transcript excerpt), stored with hashed identities.
- [x] Block flow: persisted and enforced by the matchmaker.
- [x] Bans: manual (admin API) and automatic (report threshold); enforced at handshake and matchmaking.
- [x] Admin API with constant-time token check; minimal moderation console in the web app (`/admin`).
- [x] Per-IP connection caps (hashed IPs, rotating salt), HTTP rate limits, security headers.
- [x] Verification: integration tests against real Postgres for report → auto-ban → rejected handshake,
      block → never matched, admin endpoints authorised/unauthorised.

## Phase 5 — Deployment, operations, documentation

- [x] Dockerfiles (server, web), `docker-compose.yml` (postgres, redis, coturn, server, web/nginx).
- [x] nginx config: static assets, `/api` and `/ws` proxying, WebSocket upgrade, security headers.
- [x] GitHub Actions CI: lint, typecheck, unit + integration tests with service containers, build.
- [x] Docs: SETUP, DEPLOYMENT, ARCHITECTURE, PROTOCOL, SAFETY, EXTERNAL-SERVICES (what is still manual).
- [~] Verification: production build of both apps and migrations from a clean DB verified locally; Docker images and `compose config` are validated only in CI (no Docker on the dev machine).

## Explicitly out of scope for the MVP (documented, not faked)

- Third-party age verification, CSAM hash matching, AI video-frame moderation, CAPTCHA, payments,
  accounts/logins, mobile native apps, geo-restriction. See `docs/EXTERNAL-SERVICES.md`.
