import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import { mintTurnCredentials, safeEqual } from '../identity.js';
import type { Matchmaker } from '../matchmaking/matchmaker.js';
import type { Presence } from '../session/presence.js';
import type { BanService } from '../safety/bans.js';
import type { ReportService } from '../safety/reports.js';
import type { Relay } from '../session/relay.js';
import type { Redis } from 'ioredis';
import type pg from 'pg';

export interface RouteDeps {
  config: Config;
  redis: Redis;
  pool: pg.Pool;
  matchmaker: Matchmaker;
  presence: Presence;
  bans: BanService;
  reports: ReportService;
  relay: Relay;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export function buildIceServers(config: Config): {
  iceServers: IceServer[];
  turn: boolean;
  ttl: number;
} {
  const iceServers: IceServer[] = [{ urls: config.STUN_URLS }];
  if (config.turnEnabled && config.TURN_SECRET) {
    const creds = mintTurnCredentials(config.TURN_SECRET, config.TURN_TTL_SECONDS);
    iceServers.push({
      urls: config.TURN_URLS,
      username: creds.username,
      credential: creds.credential,
    });
    return { iceServers, turn: true, ttl: creds.ttl };
  }
  return { iceServers, turn: false, ttl: 0 };
}

export async function registerRoutes(app: FastifyInstance, deps: RouteDeps): Promise<void> {
  const { config, redis, pool, matchmaker, presence, bans, reports, relay } = deps;

  app.get('/healthz', async () => ({ ok: true, node: config.NODE_ID }));

  app.get('/readyz', async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = { redis: 'fail', postgres: 'fail' };
    try {
      if ((await redis.ping()) === 'PONG') checks.redis = 'ok';
    } catch {
      /* reported below */
    }
    try {
      await pool.query('SELECT 1');
      checks.postgres = 'ok';
    } catch {
      /* reported below */
    }
    const ok = Object.values(checks).every((v) => v === 'ok');
    reply.code(ok ? 200 : 503);
    return { ok, checks };
  });

  /** ICE configuration with short-lived TURN credentials (never cache this response). */
  app.get('/api/ice', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return buildIceServers(config);
  });

  app.get('/api/stats', async () => {
    const [onlineCount, waiting] = await Promise.all([
      presence.onlineCount(),
      matchmaker.waitingCounts(),
    ]);
    return { onlineCount, waiting };
  });

  // ---------------------------------------------------------------- admin
  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = config.ADMIN_TOKEN;
    if (!token) {
      reply.code(404).send({ error: 'not_found' });
      return;
    }
    const header = req.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!presented || !safeEqual(presented, token)) {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
  };

  app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin);

    admin.get('/api/admin/reports', async (req) => {
      const q = z
        .object({
          status: z.enum(['open', 'actioned', 'dismissed']).optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        })
        .parse(req.query ?? {});
      const rows = await reports.list(q);
      return { reports: rows };
    });

    admin.get('/api/admin/reports/:id', async (req, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const row = await reports.get(id);
      if (!row) return reply.code(404).send({ error: 'not_found' });
      return { report: row };
    });

    admin.post('/api/admin/reports/:id/resolve', async (req, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const body = z
        .object({
          status: z.enum(['actioned', 'dismissed']),
          note: z.string().max(1000).optional(),
        })
        .parse(req.body ?? {});
      const row = await reports.resolve(id, body.status, body.note);
      if (!row) return reply.code(404).send({ error: 'not_found' });
      return { report: row };
    });

    admin.get('/api/admin/bans', async (req) => {
      const q = z
        .object({
          active: z.coerce.boolean().optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
        })
        .parse(req.query ?? {});
      return { bans: await bans.list({ activeOnly: q.active ?? true, limit: q.limit ?? 100 }) };
    });

    admin.post('/api/admin/bans', async (req, reply) => {
      const body = z
        .object({
          subjectType: z.enum(['client', 'ip']),
          subjectHash: z.string().regex(/^[a-f0-9]{16,64}$/),
          reason: z.string().min(1).max(500),
          hours: z
            .number()
            .int()
            .min(1)
            .max(24 * 365)
            .nullable()
            .default(null),
          note: z.string().max(1000).optional(),
          reportId: z.uuid().optional(),
        })
        .parse(req.body ?? {});
      const row = await bans.ban({
        type: body.subjectType,
        hash: body.subjectHash,
        reason: body.reason,
        source: 'admin',
        durationHours: body.hours,
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.reportId !== undefined ? { reportId: body.reportId } : {}),
      });
      if (body.subjectType === 'client') {
        await relay.broadcastBan({
          clientHash: body.subjectHash,
          reason: 'Your access has been suspended by a moderator.',
          expiresAt: row.expires_at ? row.expires_at.getTime() : null,
        });
      }
      reply.code(201);
      return { ban: row };
    });

    admin.delete('/api/admin/bans/:id', async (req, reply) => {
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const row = await bans.revoke(id);
      if (!row) return reply.code(404).send({ error: 'not_found' });
      return { ban: row };
    });
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError) {
      reply
        .code(400)
        .send({
          error: 'bad_request',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      return;
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error({ err }, 'request failed');
    reply.code(status).send({ error: status >= 500 ? 'internal_error' : (err as Error).message });
  });
}
