import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
  type ServerMessageOf,
  type ServerMessageType,
  parseServerMessage,
} from '@stranger/protocol';
import { loadConfig, type Config } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { buildApp, type App } from '../src/app.js';
import { baseTestEnv } from './env.js';

export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({ ...baseTestEnv, ...overrides });
}

export async function startTestApp(overrides: NodeJS.ProcessEnv = {}): Promise<App> {
  const config = testConfig(overrides);
  const app = await buildApp(config, createLogger(config));
  await app.start();
  return app;
}

export async function resetState(redis: Redis, pool: pg.Pool): Promise<void> {
  await redis.flushdb();
  await pool.query('TRUNCATE reports, bans, blocks, moderation_actions RESTART IDENTITY');
}

export class TestClient {
  readonly frames: ServerMessage[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;
  readonly clientId: string;
  private waiters: Array<{
    pred: (f: ServerMessage) => boolean;
    resolve: (f: ServerMessage) => void;
  }> = [];

  private constructor(
    readonly ws: WebSocket,
    clientId: string,
  ) {
    this.clientId = clientId;
    this.closed = new Promise((resolve) =>
      ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    ws.on('message', (data) => {
      const parsed = parseServerMessage(JSON.parse(data.toString()));
      if (!parsed.success) throw new Error(`server sent an invalid frame: ${data.toString()}`);
      const frame = parsed.data;
      const idx = this.waiters.findIndex((w) => w.pred(frame));
      if (idx >= 0) {
        const [w] = this.waiters.splice(idx, 1);
        w!.resolve(frame);
      } else {
        this.frames.push(frame);
      }
    });
  }

  static connect(
    port: number,
    opts: { origin?: string; clientId?: string } = {},
  ): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: opts.origin ? { origin: opts.origin } : {},
    });
    return new Promise((resolve, reject) => {
      ws.once('open', () => resolve(new TestClient(ws, opts.clientId ?? randomUUID())));
      ws.once('error', reject);
      ws.once('unexpected-response', (_req, res) =>
        reject(new Error(`unexpected response ${res.statusCode}`)),
      );
    });
  }

  send(msg: ClientMessage | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(msg));
  }

  sendRaw(raw: string | Buffer): void {
    this.ws.send(raw);
  }

  waitFor<T extends ServerMessageType>(type: T, timeoutMs = 4000): Promise<ServerMessageOf<T>> {
    return this.waitWhere((f) => f.type === type, timeoutMs, type) as Promise<ServerMessageOf<T>>;
  }

  waitWhere(
    pred: (f: ServerMessage) => boolean,
    timeoutMs = 4000,
    label = 'frame',
  ): Promise<ServerMessage> {
    const idx = this.frames.findIndex(pred);
    if (idx >= 0) return Promise.resolve(this.frames.splice(idx, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = {
        pred,
        resolve: (f: ServerMessage) => {
          clearTimeout(timer);
          resolve(f);
        },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(
          new Error(
            `timed out waiting for ${label}; buffered: ${JSON.stringify(this.frames.map((f) => f.type))}`,
          ),
        );
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  /** Resolve after `ms` only if no frame of `type` arrived in the meantime. */
  async expectNo(type: ServerMessageType, ms = 800): Promise<void> {
    try {
      const f = await this.waitFor(type, ms);
      throw new Error(`unexpected ${type} frame: ${JSON.stringify(f)}`);
    } catch (err) {
      if ((err as Error).message.startsWith('timed out')) return;
      throw err;
    }
  }

  async hello(
    opts: { ageConfirmed?: boolean; termsAccepted?: boolean } = {},
  ): Promise<ServerMessageOf<'welcome'>> {
    this.send({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      clientId: this.clientId,
      ageConfirmed: opts.ageConfirmed ?? true,
      termsAccepted: opts.termsAccepted ?? true,
    });
    return this.waitFor('welcome');
  }

  async find(
    mode: 'text' | 'video' = 'text',
    interests: string[] = [],
  ): Promise<ServerMessageOf<'queued'>> {
    this.send({ type: 'find', mode, interests });
    return this.waitFor('queued');
  }

  close(): void {
    this.ws.close();
  }
}

/** Connect, handshake and queue two clients; returns both once matched. */
export async function matchedPair(port: number, mode: 'text' | 'video' = 'text') {
  const a = await TestClient.connect(port);
  const b = await TestClient.connect(port);
  await a.hello();
  await b.hello();
  await a.find(mode);
  await b.find(mode);
  const [ma, mb] = await Promise.all([a.waitFor('matched'), b.waitFor('matched')]);
  return { a, b, ma, mb };
}
