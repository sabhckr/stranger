import type { Redis } from 'ioredis';

const HEARTBEAT_KEY = 'presence:heartbeat';
const COUNTS_KEY = 'presence:counts';
const STALE_MS = 15_000;

/** Cluster-wide online count: each node publishes its local count with a heartbeat. */
export class Presence {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly redis: Redis,
    private readonly nodeId: string,
    private readonly localCount: () => number,
    private readonly intervalMs = 5_000,
  ) {}

  start(): void {
    void this.publish();
    this.timer = setInterval(() => void this.publish(), this.intervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.redis
      .multi()
      .zrem(HEARTBEAT_KEY, this.nodeId)
      .hdel(COUNTS_KEY, this.nodeId)
      .exec()
      .catch(() => undefined);
  }

  async publish(now = Date.now()): Promise<void> {
    await this.redis
      .multi()
      .zadd(HEARTBEAT_KEY, now, this.nodeId)
      .hset(COUNTS_KEY, this.nodeId, this.localCount())
      .exec();
  }

  /** Live local count plus the last published count of every other live node. */
  async onlineCount(now = Date.now()): Promise<number> {
    await this.redis.zremrangebyscore(HEARTBEAT_KEY, '-inf', now - STALE_MS);
    const nodes = (await this.redis.zrange(HEARTBEAT_KEY, 0, -1)).filter((n) => n !== this.nodeId);
    let total = this.localCount();
    if (nodes.length === 0) return total;
    const counts = await this.redis.hmget(COUNTS_KEY, ...nodes);
    for (const c of counts) total += Number(c ?? 0);
    return total;
  }
}
