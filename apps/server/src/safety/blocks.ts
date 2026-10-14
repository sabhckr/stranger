import type { Redis } from 'ioredis';
import type pg from 'pg';

const CACHE_TTL = 7 * 24 * 3600;

/**
 * Blocks are persisted in Postgres and mirrored into Redis sets (`block:<clientHash>`) which the
 * matchmaking Lua script consults in both directions.
 */
export class BlockService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly redis: Redis,
  ) {}

  async block(blockerHash: string, blockedHash: string): Promise<void> {
    if (blockerHash === blockedHash) return;
    await this.pool.query(
      `INSERT INTO blocks (blocker_hash, blocked_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [blockerHash, blockedHash],
    );
    await this.redis
      .multi()
      .sadd(`block:${blockerHash}`, blockedHash)
      .expire(`block:${blockerHash}`, CACHE_TTL)
      .exec();
  }

  /** Load a client's block list into Redis (called at handshake so the matchmaker can see it). */
  async warmCache(clientHash: string): Promise<number> {
    const res = await this.pool.query<{ blocked_hash: string }>(
      `SELECT blocked_hash FROM blocks WHERE blocker_hash = $1`,
      [clientHash],
    );
    if (res.rows.length === 0) return 0;
    const key = `block:${clientHash}`;
    await this.redis
      .multi()
      .sadd(key, ...res.rows.map((r) => r.blocked_hash))
      .expire(key, CACHE_TTL)
      .exec();
    return res.rows.length;
  }

  async isBlocked(blockerHash: string, blockedHash: string): Promise<boolean> {
    return (await this.redis.sismember(`block:${blockerHash}`, blockedHash)) === 1;
  }
}
