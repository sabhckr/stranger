import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { ChatMode } from '@stranger/protocol';
import { DEQUEUE_LUA, MATCH_LUA } from './lua.js';

export interface Ticket {
  ticketId: string;
  sessionId: string;
  nodeId: string;
  clientHash: string;
  mode: ChatMode;
  interests: string[];
  /** clientHash of the previous partner, to avoid an immediate rematch while others are waiting */
  lastPartner?: string;
}

export interface MatchSide {
  sessionId: string;
  nodeId: string;
  clientHash: string;
}

export interface MatchEvent {
  pairId: string;
  mode: ChatMode;
  sharedInterests: string[];
  /** `a` is the ticket that triggered the match; it becomes the WebRTC initiator. */
  a: MatchSide;
  b: MatchSide;
}

export interface MatchmakerOptions {
  fallbackMs: number;
  rematchGraceMs?: number;
  scanLimit?: number;
  ticketTtlSeconds?: number;
}

export const MATCH_CHANNEL = 'mm:matched';

type RedisWithScripts = Redis & {
  mmMatch(
    ticketId: string,
    now: number,
    fallbackMs: number,
    rematchGraceMs: number,
    scanLimit: number,
  ): Promise<string[] | null>;
  mmDequeue(ticketId: string): Promise<number>;
};

/**
 * Redis-backed matchmaker. All state lives in Redis so any node can pair tickets from any node;
 * pairing itself is a single atomic Lua call (see lua.ts).
 */
export class Matchmaker {
  private readonly redis: RedisWithScripts;
  private readonly fallbackMs: number;
  private readonly rematchGraceMs: number;
  private readonly scanLimit: number;
  private readonly ticketTtl: number;

  constructor(redis: Redis, opts: MatchmakerOptions) {
    this.redis = redis as RedisWithScripts;
    this.fallbackMs = opts.fallbackMs;
    this.rematchGraceMs = opts.rematchGraceMs ?? 20_000;
    this.scanLimit = opts.scanLimit ?? 50;
    this.ticketTtl = opts.ticketTtlSeconds ?? 3600;
    if (!('mmMatch' in redis)) {
      redis.defineCommand('mmMatch', { numberOfKeys: 0, lua: MATCH_LUA });
      redis.defineCommand('mmDequeue', { numberOfKeys: 0, lua: DEQUEUE_LUA });
    }
  }

  async enqueue(ticket: Ticket, now = Date.now()): Promise<void> {
    const key = `mm:ticket:${ticket.ticketId}`;
    const multi = this.redis.multi();
    multi.hset(key, {
      sessionId: ticket.sessionId,
      nodeId: ticket.nodeId,
      clientHash: ticket.clientHash,
      mode: ticket.mode,
      interests: JSON.stringify(ticket.interests),
      enqueuedAt: String(now),
      lastPartner: ticket.lastPartner ?? '',
    });
    multi.expire(key, this.ticketTtl);
    multi.zadd(`mm:queue:${ticket.mode}`, now, ticket.ticketId);
    for (const interest of ticket.interests) {
      multi.zadd(`mm:interest:${ticket.mode}:${interest}`, now, ticket.ticketId);
    }
    await multi.exec();
  }

  async dequeue(ticketId: string): Promise<boolean> {
    return (await this.redis.mmDequeue(ticketId)) === 1;
  }

  /**
   * Try to pair `ticket` right now. On success both tickets are already removed from Redis and the
   * match event has been published on MATCH_CHANNEL; the event is also returned to the caller.
   */
  async tryMatch(ticket: Ticket, now = Date.now()): Promise<MatchEvent | null> {
    const res = await this.redis.mmMatch(
      ticket.ticketId,
      now,
      this.fallbackMs,
      this.rematchGraceMs,
      this.scanLimit,
    );
    if (!res) return null;
    const [candTicketId, sessionId, nodeId, clientHash, sharedJson] = res;
    if (!candTicketId || !sessionId || !nodeId || !clientHash) return null;
    // cjson encodes an empty Lua table as {} rather than []
    const sharedParsed: unknown = JSON.parse(sharedJson ?? '[]');
    const event: MatchEvent = {
      pairId: randomUUID(),
      mode: ticket.mode,
      sharedInterests: Array.isArray(sharedParsed) ? (sharedParsed as string[]) : [],
      a: { sessionId: ticket.sessionId, nodeId: ticket.nodeId, clientHash: ticket.clientHash },
      b: { sessionId, nodeId, clientHash },
    };
    await this.redis
      .multi()
      .hset(`pair:${event.pairId}`, {
        a: event.a.sessionId,
        b: event.b.sessionId,
        nodeA: event.a.nodeId,
        nodeB: event.b.nodeId,
        mode: event.mode,
        createdAt: String(now),
      })
      .expire(`pair:${event.pairId}`, 86_400)
      .publish(MATCH_CHANNEL, JSON.stringify(event))
      .exec();
    return event;
  }

  async waitingCounts(): Promise<Record<ChatMode, number>> {
    const [text, video] = await Promise.all([
      this.redis.zcard('mm:queue:text'),
      this.redis.zcard('mm:queue:video'),
    ]);
    return { text, video };
  }
}
