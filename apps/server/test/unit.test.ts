import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../src/safety/rate-limit.js';
import { MessageSpamFilter } from '../src/safety/spam.js';
import {
  hashClientId,
  hashIpDaily,
  hashIpStable,
  mintTurnCredentials,
  clientIpFrom,
  safeEqual,
} from '../src/identity.js';
import { loadConfig } from '../src/config.js';
import { baseTestEnv } from './env.js';

describe('TokenBucket', () => {
  it('drains and refills over time', () => {
    let t = 0;
    const b = new TokenBucket(3, 1, () => t);
    expect(b.take().ok).toBe(true);
    expect(b.take().ok).toBe(true);
    expect(b.take().ok).toBe(true);
    const denied = b.take();
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.retryAfterMs).toBe(1000);
    t = 1000;
    expect(b.take().ok).toBe(true);
    expect(b.take().ok).toBe(false);
    t = 10_000;
    expect(b.take(3).ok).toBe(true); // capped at capacity
    expect(b.take().ok).toBe(false);
  });
});

describe('MessageSpamFilter', () => {
  it('rejects empty, overlong and repeated messages', () => {
    const f = new MessageSpamFilter({
      maxLength: 10,
      maxRepeats: 2,
      maxLinksPerWindow: 2,
      linkWindowMs: 1000,
    });
    expect(f.check('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(f.check('x'.repeat(11))).toEqual({ ok: false, reason: 'too_long' });
    expect(f.check('hi').ok).toBe(true);
    expect(f.check('HI ').ok).toBe(true);
    expect(f.check('hi').ok).toBe(true);
    expect(f.check('hi')).toEqual({ ok: false, reason: 'repeated' });
    expect(f.check('new').ok).toBe(true);
  });

  it('throttles links per window and strips control characters', () => {
    let t = 0;
    const f = new MessageSpamFilter(
      { maxLength: 100, maxRepeats: 5, maxLinksPerWindow: 2, linkWindowMs: 1000 },
      () => t,
    );
    expect(f.check('see http://a.example/1').ok).toBe(true);
    expect(f.check('see http://a.example/2').ok).toBe(true);
    expect(f.check('see http://a.example/3')).toEqual({ ok: false, reason: 'links' });
    t = 1500;
    expect(f.check('see http://a.example/4').ok).toBe(true);
    const cleaned = f.check('hi\u0000there​!');
    expect(cleaned).toEqual({ ok: true, text: 'hithere!' });
  });
});

describe('identity', () => {
  it('hashes client ids stably and IPs with daily rotation', () => {
    expect(hashClientId('abc', 's')).toBe(hashClientId('abc', 's'));
    expect(hashClientId('abc', 's')).not.toBe(hashClientId('abc', 't'));
    expect(hashIpStable('1.2.3.4', 's')).toHaveLength(64);
    const d1 = hashIpDaily('1.2.3.4', 's', new Date('2026-10-14T10:00:00Z'));
    const d2 = hashIpDaily('1.2.3.4', 's', new Date('2026-10-15T10:00:00Z'));
    expect(d1).not.toBe(d2);
    expect(hashIpDaily('1.2.3.4', 's', new Date('2026-10-14T23:59:00Z'))).toBe(d1);
  });

  it('mints coturn-compatible TURN credentials', () => {
    const c = mintTurnCredentials('secret', 600, 'stranger', 1_700_000_000_000);
    expect(c.username).toBe('1700000600:stranger');
    expect(c.credential).toBe(
      createHmac('sha1', 'secret').update('1700000600:stranger').digest('base64'),
    );
    expect(c.expiresAt).toBe(1_700_000_600);
  });

  it('honours X-Forwarded-For only behind a trusted proxy', () => {
    const headers = { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' };
    expect(clientIpFrom(headers, '10.0.0.2', false)).toBe('10.0.0.2');
    expect(clientIpFrom(headers, '10.0.0.2', true)).toBe('203.0.113.9');
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });
});

describe('config', () => {
  it('applies defaults and derived flags', () => {
    const c = loadConfig(baseTestEnv);
    expect(c.PORT).toBe(0);
    expect(c.STUN_URLS).toEqual(['stun:stun.l.google.com:19302']);
    expect(c.turnEnabled).toBe(false);
    expect(c.isTest).toBe(true);
  });

  it('rejects TURN urls without a secret and placeholder secrets in production', () => {
    expect(() => loadConfig({ ...baseTestEnv, TURN_URLS: 'turn:t.example:3478' })).toThrow(
      /TURN_SECRET/,
    );
    expect(() =>
      loadConfig({
        ...baseTestEnv,
        NODE_ENV: 'production',
        IDENTITY_SECRET: 'replace-with-openssl-rand-hex-32',
      }),
    ).toThrow(/IDENTITY_SECRET/);
    const ok = loadConfig({ ...baseTestEnv, TURN_URLS: 'turn:t.example:3478', TURN_SECRET: 'x' });
    expect(ok.turnEnabled).toBe(true);
  });
});
