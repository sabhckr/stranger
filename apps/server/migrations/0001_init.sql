-- STRANGER initial schema. The server never stores chat content; these tables hold only
-- moderation data keyed by HMAC-hashed identities (see docs/ARCHITECTURE.md).

CREATE TABLE reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  pair_id         text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('text', 'video')),
  reporter_hash   text NOT NULL,
  reported_hash   text NOT NULL,
  reporter_ip_hash text,
  reason          text NOT NULL,
  details         text,
  -- Excerpt of the conversation as seen by the reporter (client-supplied, capped at 50 lines).
  transcript      jsonb,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  resolved_at     timestamptz,
  resolution_note text
);
CREATE INDEX reports_reported_created_idx ON reports (reported_hash, created_at DESC);
CREATE INDEX reports_status_created_idx ON reports (status, created_at DESC);
-- One report per reporter per pair: prevents a single user inflating counts.
CREATE UNIQUE INDEX reports_unique_per_pair_idx ON reports (pair_id, reporter_hash);

CREATE TABLE bans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  subject_type  text NOT NULL CHECK (subject_type IN ('client', 'ip')),
  subject_hash  text NOT NULL,
  reason        text NOT NULL,
  source        text NOT NULL CHECK (source IN ('auto', 'admin')),
  expires_at    timestamptz,                 -- NULL = permanent
  revoked_at    timestamptz,
  note          text
);
CREATE INDEX bans_active_subject_idx ON bans (subject_type, subject_hash) WHERE revoked_at IS NULL;

CREATE TABLE blocks (
  blocker_hash  text NOT NULL,
  blocked_hash  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_hash, blocked_hash)
);

CREATE TABLE moderation_actions (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  actor       text NOT NULL,                 -- 'system' or 'admin'
  action      text NOT NULL,                 -- e.g. 'auto_ban', 'ban', 'unban', 'resolve_report'
  subject_hash text,
  report_id   uuid REFERENCES reports (id) ON DELETE SET NULL,
  ban_id      uuid REFERENCES bans (id) ON DELETE SET NULL,
  metadata    jsonb
);
CREATE INDEX moderation_actions_created_idx ON moderation_actions (created_at DESC);
