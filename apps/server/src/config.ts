import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { MAX_MESSAGE_LENGTH } from '@stranger/protocol';

/** Load a .env file if present (never overrides variables already in the environment). */
export function loadDotEnv(explicit?: string): string | undefined {
  const candidates = [
    explicit,
    process.env.ENV_FILE,
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
  ].filter((p): p is string => Boolean(p));
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      process.loadEnvFile(file);
      return file;
    }
  }
  return undefined;
}

const bool = z
  .string()
  .optional()
  .transform((v) => (v ?? '').trim().toLowerCase())
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? Number(v) : def))
    .pipe(z.number().int().min(min).max(max));

const PLACEHOLDER_SECRET = 'replace-with-openssl-rand-hex-32';

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: int(8080, 0, 65535),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    NODE_ID: z
      .string()
      .min(1)
      .default(() => randomBytes(4).toString('hex')),
    PUBLIC_ORIGINS: list,
    TRUST_PROXY: bool,
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    DATABASE_URL: z.string().default('postgres://localhost:5432/stranger'),
    IDENTITY_SECRET: z.string().min(16, 'IDENTITY_SECRET must be at least 16 characters'),
    ADMIN_TOKEN: optionalString,
    STUN_URLS: list,
    TURN_URLS: list,
    TURN_SECRET: optionalString,
    TURN_TTL_SECONDS: int(600, 60, 86_400),
    MATCH_FALLBACK_MS: int(8000, 0, 600_000),
    MATCH_SWEEP_INTERVAL_MS: int(1000, 100, 60_000),
    /** How long after "Next" the previous partner is skipped while others are waiting. */
    MATCH_REMATCH_GRACE_MS: int(20_000, 0, 600_000),
    MAX_CONNECTIONS_PER_IP: int(6, 1, 10_000),
    MAX_MESSAGE_LENGTH: int(MAX_MESSAGE_LENGTH, 1, MAX_MESSAGE_LENGTH),
    HANDSHAKE_TIMEOUT_MS: int(10_000, 1000, 120_000),
    HEARTBEAT_INTERVAL_MS: int(25_000, 1000, 300_000),
    REPORT_AUTOBAN_THRESHOLD: int(3, 1, 1000),
    REPORT_AUTOBAN_WINDOW_HOURS: int(24, 1, 24 * 365),
    AUTOBAN_DURATION_HOURS: int(24, 1, 24 * 365),
    REPORT_RETENTION_DAYS: int(90, 1, 3650),
    /** Serve the built web app from this directory (single-service deployments). */
    STATIC_DIR: optionalString,
    /** Public site URL (e.g. https://stranger.example); added to PUBLIC_ORIGINS. */
    SITE_URL: optionalString,
    /** Injected by Render.com; used as the public origin when PUBLIC_ORIGINS is not set. */
    RENDER_EXTERNAL_URL: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.IDENTITY_SECRET === PLACEHOLDER_SECRET || env.IDENTITY_SECRET.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['IDENTITY_SECRET'],
          message: 'IDENTITY_SECRET must be a real secret of 32+ characters in production',
        });
      }
      if (env.PUBLIC_ORIGINS.length === 0 && !env.SITE_URL && !env.RENDER_EXTERNAL_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['PUBLIC_ORIGINS'],
          message: 'PUBLIC_ORIGINS (or SITE_URL) must list the site origin(s) in production',
        });
      }
    }
    if (env.TURN_URLS.length > 0 && !env.TURN_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['TURN_SECRET'],
        message: 'TURN_SECRET is required when TURN_URLS is set',
      });
    }
  });

export type Config = z.infer<typeof EnvSchema> & {
  isProduction: boolean;
  isTest: boolean;
  turnEnabled: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const data = parsed.data;
  for (const extra of [data.SITE_URL, data.RENDER_EXTERNAL_URL]) {
    if (!extra) continue;
    const origin = new URL(extra).origin;
    if (!data.PUBLIC_ORIGINS.includes(origin)) data.PUBLIC_ORIGINS.push(origin);
  }
  if (data.PUBLIC_ORIGINS.length === 0) {
    data.PUBLIC_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }
  if (data.STUN_URLS.length === 0) data.STUN_URLS = ['stun:stun.l.google.com:19302'];
  return {
    ...data,
    isProduction: data.NODE_ENV === 'production',
    isTest: data.NODE_ENV === 'test',
    turnEnabled: data.TURN_URLS.length > 0 && Boolean(data.TURN_SECRET),
  };
}
