# Safety, privacy and moderation

## Access controls

- **Consent gate**: 18+ self-attestation and acceptance of Terms/Privacy/Safety before any matching. The
  flags travel in `hello`; the server refuses `find`/`next` without them (`consent_required`).
  This is self-attestation only — see EXTERNAL-SERVICES.md for real age assurance.
- **Camera/microphone**: requested only when the user presses _Start video chat_, after an explicit note.
  Tracks are stopped on Leave and on page hide. Mute / camera-off act on the local tracks.

## Abuse controls (server side)

| Control           | Mechanism                                      | Default                        |
| ----------------- | ---------------------------------------------- | ------------------------------ |
| Message floods    | token bucket per session                       | burst 8, 3/s                   |
| Next-spamming     | navigation bucket                              | burst 4, one per 1.5 s         |
| Duplicate pastes  | identical consecutive messages                 | blocked after 2 repeats        |
| Link spraying     | messages containing URLs per minute            | 3                              |
| Signaling floods  | signal bucket                                  | burst 80, 20/s                 |
| Protocol abuse    | invalid frames                                 | socket closed (4008) after ~10 |
| Connection floods | per-IP cap (daily-rotating hash)               | 6 concurrent                   |
| HTTP              | `@fastify/rate-limit` on Redis                 | 120 req/min/IP                 |
| Origin            | WebSocket `Origin` must be in `PUBLIC_ORIGINS` | —                              |

## Reports, blocks, bans

- **Report** (any time during or right after a chat): reason, optional details, optional transcript excerpt
  (≤50 lines as seen by the reporter). One report per reporter per pair (duplicates update, never double-count).
- **Block**: persisted in Postgres, mirrored into Redis, enforced inside the matchmaking script in both
  directions. The blocked party only sees "Stranger has disconnected".
- **Automatic ban**: `REPORT_AUTOBAN_THRESHOLD` (3) distinct reporters within `REPORT_AUTOBAN_WINDOW_HOURS`
  (24) → `AUTOBAN_DURATION_HOURS` (24) ban on the hashed client id. Every connected session of that
  client is told `banned` and disconnected on all nodes; the partner sees "removed by moderation".
- **Manual moderation**: `/admin` console (token) lists open reports with transcripts; actions: ban 24 h,
  ban permanently, dismiss, revoke ban. Admin API: `GET/POST /api/admin/reports…`, `GET/POST/DELETE /api/admin/bans…`
  with `Authorization: Bearer <ADMIN_TOKEN>` (constant-time compare; 404 when disabled).
- **IP bans**: supported by the API (`subjectType: 'ip'`, stable HMAC of the IP); use sparingly (CGNAT).
- Every action is written to `moderation_actions`.

## Data model and retention

| Data                          | Stored?                                                                      | Where / how long                                               |
| ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Messages, audio, video        | **No**                                                                       | relayed only; media is peer-to-peer (TURN cannot decrypt SRTP) |
| Client id                     | hashed (HMAC-SHA256, `IDENTITY_SECRET`)                                      | in reports/blocks/bans                                         |
| IP address                    | daily-rotating hash in Redis (≤24 h); stable hash only inside IP ban records | —                                                              |
| Interests                     | Redis while waiting                                                          | removed on match/cancel/disconnect (1 h TTL safety net)        |
| Reports + transcript excerpts | Postgres                                                                     | purged after `REPORT_RETENTION_DAYS` (90)                      |
| Logs                          | stdout JSON                                                                  | no message content, hashed ids truncated                       |

## Known limitations (honest list)

- Age is self-declared; no identity or age verification.
- No automated analysis of video frames or text content for illegal material; moderation is report-driven.
- Identity is a browser-storage UUID: clearing storage resets it (bans by IP hash remain available).
- The transcript excerpt in a report is supplied by the reporter's client and could be edited by a
  malicious reporter; moderators should treat it as a claim, corroborated by multiple reports.
