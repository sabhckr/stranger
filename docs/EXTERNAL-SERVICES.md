# External services, credentials, legal review and manual operations

Everything below is **not** done by the code in this repository and must be arranged before a public launch.

## Required for a working production deployment

| Item                                                                                                                                               | Why                                                                                                | Status                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Domain + TLS certificate                                                                                                                           | HTTPS is mandatory for `getUserMedia` outside localhost; WSS for the socket                        | manual (Caddy/certbot/Cloud LB)                                                  |
| **TURN server** (self-hosted coturn via `infra/`, or hosted: Metered Open Relay has a free tier; Twilio NTS, Xirsys and Cloudflare Calls are paid) | ~10–20 % of users cannot connect video without a relay                                             | coturn: `TURN_SECRET`; hosted: `TURN_URLS` + `TURN_USERNAME` + `TURN_CREDENTIAL` |
| Public STUN                                                                                                                                        | `STUN_URLS` defaults to Google's public STUN; use your own or your TURN provider's for reliability | optional                                                                         |
| Managed PostgreSQL + Redis (or self-hosted with backups)                                                                                           | persistence and matchmaking                                                                        | credentials in `.env`                                                            |
| Secrets: `IDENTITY_SECRET`, `ADMIN_TOKEN`, `POSTGRES_PASSWORD`, `TURN_SECRET`                                                                      | hashing, admin API, DB, TURN auth                                                                  | generate with `openssl rand -hex 32`; never commit                               |

## Strongly recommended before launch (not implemented — would be faked otherwise)

| Item                               | Notes                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Age assurance**                  | Current gate is self-attestation. Jurisdictions increasingly require age verification for adult-only chat (UK OSA, several US states, EU DSA guidance). Integrate a provider (e.g. Yoti, Veriff, Persona) at the consent gate.                                                                     |
| **CSAM detection / hash matching** | Access to PhotoDNA / Safer / Thorn requires vetting and a legal entity. Needed to scan reported transcripts/frames and for mandatory reporting (e.g. NCMEC in the US).                                                                                                                             |
| **Automated content moderation**   | Text classification (OpenAI/Perspective/Hive) on reported transcripts; AI video-frame sampling (Hive, Sightengine) for nudity detection during video chats. The architecture leaves room for this: media is peer-to-peer, so frame sampling must happen in the client with consent, or via an SFU. |
| **CAPTCHA / bot gate**             | Cloudflare Turnstile or hCaptcha on the consent gate to stop automated spam clients. Rate limits exist, but a captcha is the cheap first line.                                                                                                                                                     |
| **Abuse reporting pipeline**       | Human moderators with an SLA, escalation path to law enforcement, evidence preservation procedure.                                                                                                                                                                                                 |
| **Error monitoring / metrics**     | Sentry (client + server), Prometheus/OpenTelemetry metrics (sessions, match latency, TURN usage).                                                                                                                                                                                                  |

## Legal review (template text only)

- Terms of Service, Privacy Policy and Safety pages in `apps/web/src/components/LegalPages.tsx` are
  **templates** and carry a visible "needs legal review" notice. A lawyer must adapt them (operator identity,
  governing law, GDPR/CCPA disclosures, DSA transparency obligations, cookie statement, age policy).
- Data-protection: hashed identifiers and hashed IPs are still personal data under GDPR; keep a record of
  processing, a retention policy (`REPORT_RETENTION_DAYS`) and a DSAR process.
- Mandatory reporting obligations for child sexual abuse material vary by country; confirm with counsel.

## Manual operations

- Rotate `ADMIN_TOKEN` regularly; it grants full moderation rights.
- Monitor `/readyz`; restart policy via your orchestrator.
- Back up Postgres daily; Redis needs no backup.
- Review open reports in `/admin`; the auto-ban only covers repeat offenders.
