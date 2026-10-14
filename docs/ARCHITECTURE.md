# STRANGER — Architecture

## Goals
Anonymous 1-to-1 text and video chat with instant Next/Stop, optional interest matching, strong safety
controls, low latency, horizontal scalability, and a privacy-first data model (chat content is never
stored by the server).

## Components

```
 Browser (React + TS)  ──HTTPS──►  nginx  ──►  Fastify HTTP   (/api/*, /healthz)
        │                            │
        └──────────WSS──────────────►└────►  WebSocket gateway (ws)
                                                │           │
                                                ▼           ▼
                                          Redis 7/8     PostgreSQL 17
                                     (matchmaking,    (reports, bans,
                                      presence,        blocks, moderation
                                      pub/sub,         actions — no chat
                                      rate limits)     content)

 Browser ◄════════ WebRTC (SRTP, peer-to-peer; TURN relay when NAT requires) ════════► Browser
                                       ▲
                                   coturn (STUN/TURN, time-limited HMAC credentials from /api/ice)
```

### apps/server (Node 22+, TypeScript, ESM)
- **HTTP (Fastify 5)**: health/readiness, ICE server config with short-lived TURN credentials, public
  stats, admin moderation endpoints (token protected), security headers (helmet), rate limiting.
- **WebSocket gateway (`ws`)**: one connection per anonymous session. Every inbound frame is parsed with
  the shared zod protocol; invalid frames are rejected and counted. Heartbeats drop dead sockets.
- **Matchmaker (Redis + Lua)**: tickets live in Redis so any node can pair any two users. Pairing is a
  single atomic Lua script: prefer the oldest ticket sharing an interest, fall back to the oldest ticket of
  the same mode after `MATCH_FALLBACK_MS`, never pair a user with themself, a blocked user, or their
  immediately previous partner. Matches are announced on a pub/sub channel so the owning nodes deliver
  `matched` to their local sockets.
- **Pair relay**: messages, typing and WebRTC signaling are forwarded to the partner. If the partner is on
  another node the frame is published to that node's channel. Content is never written to disk.
- **Safety**: token-bucket limiters per session, duplicate/flood detection, link throttling, per-IP
  connection caps (IPs are HMAC-hashed with a daily rotating salt), bans cached in Redis and persisted in
  Postgres, blocks enforced inside the matchmaking script, reports persisted with hashed identities.

### apps/web (Vite 8, React 19, TypeScript)
- Consent gate (18+ self-attestation and terms) before any matching.
- Landing (mode, interests, presence) → Chat (text or video) → Admin console (token).
- `ChatClient`: reconnecting WebSocket wrapper validating every server frame against the protocol.
- `RtcSession`: RTCPeerConnection with the perfect-negotiation pattern; media is only requested after
  explicit user consent; tracks are stopped on Next/Stop/leave.
- Accessibility: semantic landmarks, `aria-live` message log, labelled controls, full keyboard operation,
  visible focus, reduced-motion support, WCAG AA contrast on the dark palette.

### packages/protocol
Single source of truth for the WebSocket wire protocol (zod schemas + inferred types) shared by server,
client and tests.

## Identity and privacy model
| Datum | Where | Form | Retention |
|---|---|---|---|
| Client ID (random UUID) | browser localStorage, server memory | HMAC-SHA256 with `IDENTITY_SECRET` before any persistence | until the user clears storage |
| IP address | server memory / Redis | daily-rotating HMAC for rate limits; stable HMAC only inside ban records | Redis keys expire ≤ 24 h |
| Chat messages | never persisted | relayed only | none |
| Report transcript excerpt | Postgres `reports` | last ≤ 50 messages as seen by the reporter | `REPORT_RETENTION_DAYS` (default 90) |
| Media | peer-to-peer (or TURN relay, which cannot decrypt SRTP) | — | none |

## Scaling
Stateless nodes behind a load balancer with sticky WebSocket routing not required: matchmaking state and
cross-node delivery live in Redis. Postgres only takes moderation writes. TURN is the main bandwidth cost
and runs as a separate service.
