import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app.js';
import { resetState, startTestApp } from './helpers.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: Response): Promise<any> => r.json() as Promise<any>;

describe('HTTP API', () => {
  let app: App;
  let base: string;
  const auth = { authorization: 'Bearer test-admin-token' };

  beforeAll(async () => {
    app = await startTestApp();
    base = `http://127.0.0.1:${app.port}`;
  });
  afterAll(async () => {
    await app.stop();
  });
  beforeEach(async () => {
    await resetState(app.redis, app.pool);
  });

  it('serves health and readiness', async () => {
    expect((await json(await fetch(`${base}/healthz`))).ok).toBe(true);
    const ready = await fetch(`${base}/readyz`);
    expect(ready.status).toBe(200);
    expect(await json(ready)).toEqual({ ok: true, checks: { redis: 'ok', postgres: 'ok' } });
  });

  it('returns STUN-only ICE config when TURN is not configured', async () => {
    const res = await fetch(`${base}/api/ice`);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await json(res);
    expect(body.turn).toBe(false);
    expect(body.iceServers).toEqual([{ urls: ['stun:stun.l.google.com:19302'] }]);
  });

  it('mints time-limited TURN credentials when configured', async () => {
    const turnApp = await startTestApp({
      TURN_URLS: 'turn:turn.example:3478?transport=udp,turns:turn.example:5349',
      TURN_SECRET: 'turnsecret',
      TURN_TTL_SECONDS: '120',
      NODE_ID: 'turn-node',
    });
    try {
      const body = await json(await fetch(`http://127.0.0.1:${turnApp.port}/api/ice`));
      expect(body.turn).toBe(true);
      expect(body.ttl).toBe(120);
      const turn = body.iceServers[1];
      expect(turn.urls).toEqual([
        'turn:turn.example:3478?transport=udp',
        'turns:turn.example:5349',
      ]);
      const [expiry, label] = turn.username.split(':');
      expect(label).toBe('stranger');
      expect(Number(expiry)).toBeGreaterThan(Date.now() / 1000 + 100);
      expect(turn.credential).toBe(
        createHmac('sha1', 'turnsecret').update(turn.username).digest('base64'),
      );
    } finally {
      await turnApp.stop();
    }
  });

  it('exposes public stats', async () => {
    const body = await json(await fetch(`${base}/api/stats`));
    expect(body).toEqual({ onlineCount: expect.any(Number), waiting: { text: 0, video: 0 } });
  });

  it('protects the admin API', async () => {
    expect((await fetch(`${base}/api/admin/reports`)).status).toBe(401);
    expect(
      (await fetch(`${base}/api/admin/reports`, { headers: { authorization: 'Bearer wrong' } }))
        .status,
    ).toBe(401);
    const ok = await fetch(`${base}/api/admin/reports`, { headers: auth });
    expect(ok.status).toBe(200);
    expect(await json(ok)).toEqual({ reports: [] });

    const noAdmin = await startTestApp({ ADMIN_TOKEN: '', NODE_ID: 'noadmin' });
    try {
      expect(
        (await fetch(`http://127.0.0.1:${noAdmin.port}/api/admin/reports`, { headers: auth }))
          .status,
      ).toBe(404);
    } finally {
      await noAdmin.stop();
    }
  });

  it('lets admins ban, list, resolve and unban', async () => {
    const hash = 'a'.repeat(64);
    const created = await fetch(`${base}/api/admin/bans`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        subjectType: 'client',
        subjectHash: hash,
        reason: 'manual test',
        hours: 1,
      }),
    });
    expect(created.status).toBe(201);
    const ban = (await json(created)).ban;
    expect(ban.source).toBe('admin');
    expect(await app.bans.isBanned('client', hash)).toMatchObject({
      id: ban.id,
      reason: 'manual test',
    });

    const list = await json(await fetch(`${base}/api/admin/bans`, { headers: auth }));
    expect(list.bans.map((b: { id: string }) => b.id)).toEqual([ban.id]);

    const bad = await fetch(`${base}/api/admin/bans`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ subjectType: 'client', subjectHash: 'not-a-hash', reason: '' }),
    });
    expect(bad.status).toBe(400);

    const revoked = await fetch(`${base}/api/admin/bans/${ban.id}`, {
      method: 'DELETE',
      headers: auth,
    });
    expect(revoked.status).toBe(200);
    expect(await app.bans.isBanned('client', hash)).toBeNull();
    expect(
      (await fetch(`${base}/api/admin/bans/${ban.id}`, { method: 'DELETE', headers: auth })).status,
    ).toBe(404);

    const { id } = await app.reports.create({
      pairId: 'p1',
      mode: 'text',
      reporterHash: 'r',
      reportedHash: hash,
      reporterIpHash: null,
      reason: 'spam',
    });
    const resolved = await fetch(`${base}/api/admin/reports/${id}/resolve`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed', note: 'no evidence' }),
    });
    expect(resolved.status).toBe(200);
    expect((await json(resolved)).report.status).toBe('dismissed');
    const open = await json(
      await fetch(`${base}/api/admin/reports?status=open`, { headers: auth }),
    );
    expect(open.reports).toEqual([]);
  });

  it('applies HTTP rate limiting', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 125; i++) statuses.push((await fetch(`${base}/healthz`)).status);
    expect(statuses).toContain(429);
  });
});
