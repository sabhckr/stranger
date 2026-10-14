import type { Redis } from 'ioredis';
import type pg from 'pg';

export type BanSubjectType = 'client' | 'ip';

export interface ActiveBan {
  id: string;
  reason: string;
  expiresAt: number | null;
}

export interface BanRow {
  id: string;
  created_at: Date;
  subject_type: BanSubjectType;
  subject_hash: string;
  reason: string;
  source: 'auto' | 'admin';
  expires_at: Date | null;
  revoked_at: Date | null;
  note: string | null;
}

const NEGATIVE_TTL = 60;
const POSITIVE_MAX_TTL = 3600;

/** Bans are persisted in Postgres and cached in Redis so the hot path never hits the database. */
export class BanService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly redis: Redis,
  ) {}

  private cacheKey(type: BanSubjectType, hash: string): string {
    return `ban:${type}:${hash}`;
  }

  async isBanned(type: BanSubjectType, hash: string, now = Date.now()): Promise<ActiveBan | null> {
    const key = this.cacheKey(type, hash);
    const cached = await this.redis.get(key);
    if (cached === '0') return null;
    if (cached) {
      const ban = JSON.parse(cached) as ActiveBan;
      if (ban.expiresAt === null || ban.expiresAt > now) return ban;
    }
    const res = await this.pool.query<Pick<BanRow, 'id' | 'reason' | 'expires_at'>>(
      `SELECT id, reason, expires_at FROM bans
        WHERE subject_type = $1 AND subject_hash = $2 AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY expires_at DESC NULLS FIRST LIMIT 1`,
      [type, hash],
    );
    const row = res.rows[0];
    if (!row) {
      await this.redis.set(key, '0', 'EX', NEGATIVE_TTL);
      return null;
    }
    const ban: ActiveBan = {
      id: row.id,
      reason: row.reason,
      expiresAt: row.expires_at ? row.expires_at.getTime() : null,
    };
    await this.cachePositive(ban, type, hash, now);
    return ban;
  }

  private async cachePositive(
    ban: ActiveBan,
    type: BanSubjectType,
    hash: string,
    now: number,
  ): Promise<void> {
    const ttl =
      ban.expiresAt === null
        ? POSITIVE_MAX_TTL
        : Math.max(1, Math.min(POSITIVE_MAX_TTL, Math.ceil((ban.expiresAt - now) / 1000)));
    await this.redis.set(this.cacheKey(type, hash), JSON.stringify(ban), 'EX', ttl);
  }

  async ban(input: {
    type: BanSubjectType;
    hash: string;
    reason: string;
    source: 'auto' | 'admin';
    durationHours: number | null;
    note?: string;
    reportId?: string;
  }): Promise<BanRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<BanRow>(
        `INSERT INTO bans (subject_type, subject_hash, reason, source, expires_at, note)
         VALUES ($1, $2, $3, $4, CASE WHEN $5::int IS NULL THEN NULL ELSE now() + ($5::int * interval '1 hour') END, $6)
         RETURNING *`,
        [
          input.type,
          input.hash,
          input.reason,
          input.source,
          input.durationHours,
          input.note ?? null,
        ],
      );
      const row = res.rows[0]!;
      await client.query(
        `INSERT INTO moderation_actions (actor, action, subject_hash, report_id, ban_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.source === 'auto' ? 'system' : 'admin',
          input.source === 'auto' ? 'auto_ban' : 'ban',
          input.hash,
          input.reportId ?? null,
          row.id,
          JSON.stringify({ reason: input.reason, hours: input.durationHours }),
        ],
      );
      await client.query('COMMIT');
      await this.cachePositive(
        {
          id: row.id,
          reason: row.reason,
          expiresAt: row.expires_at ? row.expires_at.getTime() : null,
        },
        input.type,
        input.hash,
        Date.now(),
      );
      return row;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async revoke(id: string, note?: string): Promise<BanRow | null> {
    const res = await this.pool.query<BanRow>(
      `UPDATE bans SET revoked_at = now(), note = COALESCE($2, note) WHERE id = $1 AND revoked_at IS NULL RETURNING *`,
      [id, note ?? null],
    );
    const row = res.rows[0];
    if (!row) return null;
    await this.pool.query(
      `INSERT INTO moderation_actions (actor, action, subject_hash, ban_id) VALUES ('admin', 'unban', $1, $2)`,
      [row.subject_hash, row.id],
    );
    await this.redis.del(this.cacheKey(row.subject_type, row.subject_hash));
    return row;
  }

  async list(opts: { activeOnly?: boolean; limit?: number } = {}): Promise<BanRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const res = await this.pool.query<BanRow>(
      `SELECT * FROM bans
        WHERE ($1::boolean = false OR (revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())))
        ORDER BY created_at DESC LIMIT $2`,
      [opts.activeOnly ?? false, limit],
    );
    return res.rows;
  }
}
