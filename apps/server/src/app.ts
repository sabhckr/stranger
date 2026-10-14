import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import type { Config } from './config.js';
import type { Logger } from './logger.js';
import { createRedis } from './redis/client.js';
import { createPool } from './db/pool.js';
import { Matchmaker } from './matchmaking/matchmaker.js';
import { Relay } from './session/relay.js';
import { Presence } from './session/presence.js';
import { BanService } from './safety/bans.js';
import { BlockService } from './safety/blocks.js';
import { ReportService } from './safety/reports.js';
import { ModerationService } from './safety/moderation.js';
import { Gateway } from './ws/gateway.js';
import { registerRoutes } from './http/routes.js';

export interface App {
  fastify: FastifyInstance;
  gateway: Gateway;
  redis: Redis;
  pool: pg.Pool;
  matchmaker: Matchmaker;
  bans: BanService;
  blocks: BlockService;
  reports: ReportService;
  /** Bound port after start(). */
  port: number;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function buildApp(config: Config, log: Logger): Promise<App> {
  const redis = createRedis(config.REDIS_URL, `${config.NODE_ID}:main`);
  const sub = createRedis(config.REDIS_URL, `${config.NODE_ID}:sub`);
  const pool = createPool(config.DATABASE_URL);

  const matchmaker = new Matchmaker(redis, {
    fallbackMs: config.MATCH_FALLBACK_MS,
    rematchGraceMs: config.MATCH_REMATCH_GRACE_MS,
  });
  const bans = new BanService(pool, redis);
  const blocks = new BlockService(pool, redis);
  const reports = new ReportService(pool);
  const moderation = new ModerationService(
    reports,
    bans,
    {
      autobanThreshold: config.REPORT_AUTOBAN_THRESHOLD,
      autobanWindowHours: config.REPORT_AUTOBAN_WINDOW_HOURS,
      autobanDurationHours: config.AUTOBAN_DURATION_HOURS,
    },
    log,
  );

  // Gateway and relay reference each other; wire via late-bound handlers.
  // eslint-disable-next-line prefer-const -- assigned after the relay that needs it is built
  let gateway: Gateway;
  const relay = new Relay(
    redis,
    sub,
    config.NODE_ID,
    {
      onEvent: (e) => gateway.onRelayEvent(e),
      onMatch: (e) => gateway.onMatch(e),
      onBan: (e) => gateway.onBan(e),
    },
    log,
  );
  const presence = new Presence(redis, config.NODE_ID, () => gateway.localCount());
  gateway = new Gateway({
    config,
    log,
    redis,
    matchmaker,
    relay,
    presence,
    bans,
    blocks,
    moderation,
  });

  const fastify = Fastify({
    loggerInstance: log.child({ component: 'http' }) as unknown as FastifyBaseLogger,
    trustProxy: config.TRUST_PROXY,
    disableRequestLogging: config.isProduction,
    bodyLimit: 64 * 1024,
  });
  await fastify.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await fastify.register(cors, { origin: config.PUBLIC_ORIGINS, credentials: false });
  await fastify.register(rateLimit, { max: 120, timeWindow: '1 minute', redis });
  await registerRoutes(fastify, {
    config,
    redis,
    pool,
    matchmaker,
    presence,
    bans,
    reports,
    relay,
  });

  const app: App = {
    fastify,
    gateway,
    redis,
    pool,
    matchmaker,
    bans,
    blocks,
    reports,
    port: 0,
    async start() {
      await relay.start();
      gateway.attach(fastify.server, '/ws');
      await fastify.listen({ host: config.HOST, port: config.PORT });
      const address = fastify.server.address();
      app.port = typeof address === 'object' && address ? address.port : config.PORT;
      presence.start();
      gateway.start();
      log.info(
        { host: config.HOST, port: app.port, node: config.NODE_ID },
        'STRANGER server listening',
      );
    },
    async stop() {
      await gateway.stop();
      await presence.stop();
      await relay.stop();
      await fastify.close();
      await Promise.allSettled([redis.quit(), sub.quit(), pool.end()]);
    },
  };
  return app;
}
