# WebSocket protocol (v1)

Endpoint: `/ws`. Frames are JSON objects with a `type` field, validated with zod on both ends
(`packages/protocol/src/index.ts` is the source of truth). Max payload 128 KiB. The server pings every
`HEARTBEAT_INTERVAL_MS` and drops sockets that do not pong.

## Client → Server

| type      | fields                                                                     | notes                                                                                          |
| --------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `hello`   | `protocolVersion: 1`, `clientId` (UUID), `ageConfirmed`, `termsAccepted`   | must be the first frame (10 s handshake timeout)                                               |
| `find`    | `mode: 'text'                                                              | 'video'`, `interests: string[]` (≤10, normalised)                                              | needs consent; error `already_searching` if queued |
| `cancel`  | —                                                                          | leave the queue                                                                                |
| `message` | `text` (1–2000 chars)                                                      | only while matched; spam filter applies                                                        |
| `typing`  | `isTyping`                                                                 | relayed, silently rate-limited                                                                 |
| `next`    | —                                                                          | end current chat (partner gets `partner_left: next`) and re-queue with the same mode/interests |
| `stop`    | —                                                                          | end chat or leave queue → `idle`                                                               |
| `signal`  | `data: {kind:'description', description}` or `{kind:'candidate', candidate | null}`                                                                                         | video pairs only, relayed verbatim                 |
| `report`  | `reason`, `pairId?`, `details?`, `transcript?` (≤50 lines)                 | current or most recent pair                                                                    |
| `block`   | `pairId?`                                                                  | persisted; the matchmaker never pairs the two again                                            |
| `ping`    | —                                                                          | → `pong`                                                                                       |

## Server → Client

| type           | fields                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------- |
| `welcome`      | `sessionId`, `onlineCount`, `maxMessageLength`, `features: {video, turn}`                   |
| `idle`         | —                                                                                           |
| `queued`       | `mode`, `interests`                                                                         |
| `matched`      | `pairId`, `mode`, `sharedInterests`, `initiator` (creates the WebRTC offer / impolite peer) |
| `message`      | `text`, `ts`                                                                                |
| `typing`       | `isTyping`                                                                                  |
| `partner_left` | `reason: 'next'                                                                             | 'stop'                              | 'disconnected' | 'moderated'` |
| `signal`       | `data`                                                                                      |
| `presence`     | `onlineCount` (every 10 s)                                                                  |
| `report_ack`   | `reportId`                                                                                  |
| `block_ack`    | —                                                                                           |
| `banned`       | `reason`, `expiresAt                                                                        | null` — followed by close code 4003 |
| `error`        | `code`, `message`, `retryAfterMs?`                                                          |
| `pong`         | —                                                                                           |

Error codes: `invalid_message`, `handshake_required`, `consent_required`, `not_matched`, `already_searching`,
`rate_limited`, `message_blocked`, `banned`, `too_many_connections`, `unsupported_version`, `server_error`.

## Close codes

4000 invalid protocol · 4001 handshake timeout · 4002 replaced · 4003 banned · 4004 too many connections ·
4005 origin not allowed · 4008 abuse (repeated invalid frames) · 1012 server shutdown.

## Matching semantics

1. A ticket is indexed by mode and by each interest. Pairing prefers the oldest ticket sharing an interest.
2. After `MATCH_FALLBACK_MS` (or immediately when the user has no interests) the oldest ticket in the same
   mode is accepted — but only if that ticket has also waited out its own fallback window.
3. Never paired: the same browser, either side having blocked the other, and (for `MATCH_REMATCH_GRACE_MS`)
   the immediately previous partner.
4. Pairing is one atomic Lua script; the match is announced on Redis pub/sub so any node can deliver it.
