import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { Matchmaker, type Ticket } from '../src/matchmaking/matchmaker.js';
import { TEST_REDIS_URL } from './env.js';

function ticket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    ticketId: id,
    sessionId: `s-${id}`,
    nodeId: 'n1',
    clientHash: `c-${id}`,
    mode: 'text',
    interests: [],
    ...overrides,
  };
}

describe('Matchmaker (real Redis)', () => {
  let redis: Redis;
  let mm: Matchmaker;

  beforeAll(() => {
    redis = new Redis(TEST_REDIS_URL);
    mm = new Matchmaker(redis, { fallbackMs: 1000, rematchGraceMs: 500 });
  });
  afterAll(async () => {
    await redis.quit();
  });
  beforeEach(async () => {
    await redis.flushdb();
  });

  it('pairs two tickets without interests immediately and removes both from Redis', async () => {
    const a = ticket('a');
    const b = ticket('b');
    await mm.enqueue(a, 1000);
    expect(await mm.tryMatch(a, 1000)).toBeNull();
    await mm.enqueue(b, 1001);
    const ev = await mm.tryMatch(b, 1001);
    expect(ev).not.toBeNull();
    expect(ev!.a.sessionId).toBe('s-b');
    expect(ev!.b.sessionId).toBe('s-a');
    expect(await redis.exists('mm:ticket:a', 'mm:ticket:b')).toBe(0);
    expect(await redis.zcard('mm:queue:text')).toBe(0);
    expect(await redis.hget(`pair:${ev!.pairId}`, 'mode')).toBe('text');
  });

  it('prefers shared interests and only falls back after both have waited', async () => {
    const music = ticket('m1', { interests: ['music'] });
    const films = ticket('f1', { interests: ['films'] });
    const music2 = ticket('m2', { interests: ['music', 'art'] });
    await mm.enqueue(music, 0);
    await mm.enqueue(films, 0);
    // films vs music: no shared interest and nobody has waited long enough
    expect(await mm.tryMatch(films, 10)).toBeNull();
    await mm.enqueue(music2, 20);
    const ev = await mm.tryMatch(music2, 20);
    expect(ev?.b.sessionId).toBe('s-m1');
    expect(ev?.sharedInterests).toEqual(['music']);
    // films is alone; a newcomer with no interests must still wait for films' fallback window
    const anyone = ticket('x', { interests: [] });
    await mm.enqueue(anyone, 100);
    expect(await mm.tryMatch(anyone, 100)).toBeNull();
    const late = await mm.tryMatch(anyone, 1200);
    expect(late?.b.sessionId).toBe('s-f1');
    expect(late?.sharedInterests).toEqual([]);
  });

  it('never pairs the same client, blocked clients, or (briefly) the previous partner', async () => {
    const a = ticket('a', { clientHash: 'same' });
    const a2 = ticket('a2', { clientHash: 'same' });
    await mm.enqueue(a, 0);
    await mm.enqueue(a2, 0);
    expect(await mm.tryMatch(a2, 5000)).toBeNull();

    await redis.flushdb();
    const blocker = ticket('bl', { clientHash: 'blocker' });
    const blocked = ticket('bd', { clientHash: 'blocked' });
    await redis.sadd('block:blocker', 'blocked');
    await mm.enqueue(blocker, 0);
    await mm.enqueue(blocked, 0);
    expect(await mm.tryMatch(blocked, 5000)).toBeNull();
    expect(await mm.tryMatch(blocker, 5000)).toBeNull();

    await redis.flushdb();
    const p = ticket('p', { clientHash: 'p', lastPartner: 'q' });
    const q = ticket('q', { clientHash: 'q', lastPartner: 'p' });
    await mm.enqueue(p, 0);
    await mm.enqueue(q, 0);
    expect(await mm.tryMatch(q, 100)).toBeNull(); // within rematch grace
    const ev = await mm.tryMatch(q, 600); // grace over, nobody else: rematch allowed
    expect(ev?.b.sessionId).toBe('s-p');
  });

  it('dequeue removes a ticket from every index', async () => {
    const t = ticket('d', { interests: ['go', 'rust'] });
    await mm.enqueue(t, 0);
    expect(await mm.dequeue('d')).toBe(true);
    expect(await mm.dequeue('d')).toBe(false);
    expect(await redis.zcard('mm:interest:text:go')).toBe(0);
    expect(await redis.zcard('mm:queue:text')).toBe(0);
    expect(await mm.waitingCounts()).toEqual({ text: 0, video: 0 });
  });
});
