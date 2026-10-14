import { Redis } from 'ioredis';

export type RedisClient = Redis;

export function createRedis(url: string, name = 'main'): Redis {
  return new Redis(url, {
    connectionName: `stranger:${name}`,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(1000 * 2 ** Math.min(times, 5), 30_000),
  });
}
