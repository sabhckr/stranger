import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CloseCode, PROTOCOL_VERSION } from '@stranger/protocol';
import type { App } from '../src/app.js';
import { hashClientId } from '../src/identity.js';
import { baseTestEnv } from './env.js';
import { TestClient, matchedPair, resetState, startTestApp } from './helpers.js';

describe('WebSocket gateway (real Redis + Postgres)', () => {
  let app: App;
  beforeAll(async () => {
    app = await startTestApp();
  });
  afterAll(async () => {
    await app.stop();
  });
  beforeEach(async () => {
    await resetState(app.redis, app.pool);
  });

  it('requires hello before anything else and welcomes with a presence count', async () => {
    const c = await TestClient.connect(app.port);
    c.send({ type: 'find', mode: 'text', interests: [] });
    const err = await c.waitFor('error');
    expect(err.code).toBe('handshake_required');
    const welcome = await c.hello();
    expect(welcome.sessionId).toMatch(/[0-9a-f-]{36}/);
    expect(welcome.onlineCount).toBeGreaterThanOrEqual(1);
    expect(welcome.features.video).toBe(true);
    expect(welcome.features.turn).toBe(false);
    c.send({ type: 'ping' });
    await c.waitFor('pong');
    c.close();
  });

  it('closes sockets that never complete the handshake', async () => {
    const c = await TestClient.connect(app.port);
    const closed = await c.closed;
    expect(closed.code).toBe(CloseCode.HANDSHAKE_TIMEOUT);
  });

  it('refuses matching without consent', async () => {
    const c = await TestClient.connect(app.port);
    await c.hello({ ageConfirmed: false });
    c.send({ type: 'find', mode: 'text', interests: [] });
    expect((await c.waitFor('error')).code).toBe('consent_required');
    c.close();
  });

  it('matches two text users, relays messages and typing, and Next re-queues', async () => {
    const { a, b, ma, mb } = await matchedPair(app.port);
    expect(ma.pairId).toBe(mb.pairId);
    expect(ma.initiator).not.toBe(mb.initiator);
    expect(ma.mode).toBe('text');

    a.send({ type: 'message', text: 'hello there' });
    const msg = await b.waitFor('message');
    expect(msg.text).toBe('hello there');
    expect(msg.ts).toBeGreaterThan(0);
    await a.expectNo('message', 300); // sender does not get an echo

    b.send({ type: 'typing', isTyping: true });
    expect((await a.waitFor('typing')).isTyping).toBe(true);

    a.send({ type: 'next' });
    expect((await b.waitFor('partner_left')).reason).toBe('next');
    const q = await a.waitFor('queued');
    expect(q.mode).toBe('text');

    // messages after the pair ended are rejected
    b.send({ type: 'message', text: 'anyone?' });
    expect((await b.waitFor('error')).code).toBe('not_matched');

    // b searches again; the previous partner is skipped during the rematch grace period (400 ms in
    // tests) and then paired again by the sweeper because nobody else is online
    await b.find('text');
    await a.expectNo('matched', 250);
    const [ma2, mb2] = await Promise.all([a.waitFor('matched'), b.waitFor('matched')]);
    expect(ma2.pairId).toBe(mb2.pairId);
    expect(ma2.pairId).not.toBe(ma.pairId);
    a.close();
    b.close();
  });

  it('Stop ends the chat for both and Cancel leaves the queue', async () => {
    const { a, b } = await matchedPair(app.port);
    a.send({ type: 'stop' });
    await a.waitFor('idle');
    expect((await b.waitFor('partner_left')).reason).toBe('stop');

    await b.find('text');
    b.send({ type: 'cancel' });
    await b.waitFor('idle');
    expect(await app.matchmaker.waitingCounts()).toEqual({ text: 0, video: 0 });
    a.close();
    b.close();
  });

  it('tells the partner when a socket disconnects', async () => {
    const { a, b } = await matchedPair(app.port);
    a.close();
    expect((await b.waitFor('partner_left')).reason).toBe('disconnected');
    b.close();
  });

  it('prefers shared interests and falls back via the sweeper', async () => {
    const music = await TestClient.connect(app.port);
    const films = await TestClient.connect(app.port);
    const music2 = await TestClient.connect(app.port);
    await Promise.all([music.hello(), films.hello(), music2.hello()]);
    await music.find('text', ['Music']);
    await films.find('text', ['films']);
    await music2.find('text', ['music', 'art']);
    const [m1, m2] = await Promise.all([music.waitFor('matched'), music2.waitFor('matched')]);
    expect(m1.pairId).toBe(m2.pairId);
    expect(m1.sharedInterests).toEqual(['music']);

    // films waits alone; a newcomer with no interests is paired after the fallback window (300 ms)
    const anyone = await TestClient.connect(app.port);
    await anyone.hello();
    await anyone.find('text');
    const [f, x] = await Promise.all([
      films.waitFor('matched', 3000),
      anyone.waitFor('matched', 3000),
    ]);
    expect(f.pairId).toBe(x.pairId);
    expect(f.sharedInterests).toEqual([]);
    for (const c of [music, films, music2, anyone]) c.close();
  });

  it('keeps text and video queues separate', async () => {
    const t = await TestClient.connect(app.port);
    const v = await TestClient.connect(app.port);
    await t.hello();
    await v.hello();
    await t.find('text');
    await v.find('video');
    await t.expectNo('matched', 700);
    await v.expectNo('matched', 100);
    t.close();
    v.close();
  });

  it('relays WebRTC signaling only inside a video pair', async () => {
    const { a, b } = await matchedPair(app.port, 'video');
    a.send({
      type: 'signal',
      data: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } },
    });
    const sig = await b.waitFor('signal');
    expect(sig.data).toEqual({ kind: 'description', description: { type: 'offer', sdp: 'v=0' } });
    b.send({ type: 'signal', data: { kind: 'candidate', candidate: null } });
    expect((await a.waitFor('signal')).data).toEqual({ kind: 'candidate', candidate: null });
    a.close();
    b.close();

    const { a: ta } = await matchedPair(app.port, 'text');
    ta.send({ type: 'signal', data: { kind: 'candidate', candidate: null } });
    expect((await ta.waitFor('error')).code).toBe('not_matched');
    ta.close();
  });

  it('rate-limits floods and blocks repeated messages', async () => {
    const { a, b } = await matchedPair(app.port);
    for (let i = 0; i < 20; i++) a.send({ type: 'message', text: `msg ${i}` });
    const err = await a.waitFor('error');
    expect(err.code).toBe('rate_limited');
    expect(err.retryAfterMs).toBeGreaterThan(0);

    const { a: c, b: d } = await matchedPair(app.port);
    c.send({ type: 'message', text: 'same' });
    c.send({ type: 'message', text: 'same' });
    c.send({ type: 'message', text: 'same' });
    c.send({ type: 'message', text: 'same' });
    const blocked = await c.waitFor('error');
    expect(blocked.code).toBe('message_blocked');
    await d.waitFor('message');
    for (const x of [a, b, c, d]) x.close();
  });

  it('drops protocol violators after repeated invalid frames', async () => {
    const c = await TestClient.connect(app.port);
    await c.hello();
    c.sendRaw('not json');
    expect((await c.waitFor('error')).code).toBe('invalid_message');
    for (let i = 0; i < 12; i++) c.sendRaw('{"type":"nope"}');
    const closed = await c.closed;
    expect(closed.code).toBe(CloseCode.ABUSE);
  });

  it('rejects disallowed origins at the upgrade', async () => {
    await expect(TestClient.connect(app.port, { origin: 'http://evil.example' })).rejects.toThrow(
      /403/,
    );
    const ok = await TestClient.connect(app.port, { origin: 'http://localhost:5173' });
    await ok.hello();
    ok.close();
  });

  it('block prevents future matches and ends the current chat quietly', async () => {
    const { a, b } = await matchedPair(app.port);
    a.send({ type: 'block' });
    await a.waitFor('block_ack');
    await a.waitFor('idle');
    expect((await b.waitFor('partner_left')).reason).toBe('disconnected');

    await a.find('text');
    await b.find('text');
    await a.expectNo('matched', 900);
    await b.expectNo('matched', 100);

    const c = await TestClient.connect(app.port);
    await c.hello();
    await c.find('text');
    const mc = await c.waitFor('matched', 3000);
    const other = await Promise.race([a.waitFor('matched', 3000), b.waitFor('matched', 3000)]);
    expect(other.pairId).toBe(mc.pairId);

    const rows = await app.pool.query('SELECT blocker_hash, blocked_hash FROM blocks');
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].blocker_hash).toBe(hashClientId(a.clientId, baseTestEnv.IDENTITY_SECRET!));
    expect(rows.rows[0].blocked_hash).toBe(hashClientId(b.clientId, baseTestEnv.IDENTITY_SECRET!));
    for (const x of [a, b, c]) x.close();
  });

  it('a block persists across reconnects', async () => {
    const { a, b } = await matchedPair(app.port);
    a.send({ type: 'block' });
    await a.waitFor('block_ack');
    a.close();
    await b.waitFor('partner_left');
    await app.redis.flushdb(); // simulate a cold Redis: the block must be reloaded from Postgres
    const a2 = await TestClient.connect(app.port, { clientId: a.clientId });
    await a2.hello();
    await a2.find('text');
    await b.find('text');
    await a2.expectNo('matched', 900);
    a2.close();
    b.close();
  });

  it('reports are stored, repeated reports auto-ban, and banned users are refused', async () => {
    const secret = baseTestEnv.IDENTITY_SECRET!;
    const banApp = await startTestApp({ REPORT_AUTOBAN_THRESHOLD: '2', NODE_ID: 'node-b' });
    try {
      const offender = await TestClient.connect(banApp.port);
      const r1 = await TestClient.connect(banApp.port);
      await offender.hello();
      await r1.hello();
      await offender.find('text');
      await r1.find('text');
      const [mo, m1] = await Promise.all([offender.waitFor('matched'), r1.waitFor('matched')]);
      expect(mo.pairId).toBe(m1.pairId);
      r1.send({
        type: 'report',
        reason: 'harassment',
        details: 'abusive',
        transcript: [{ from: 'partner', text: 'bad words', ts: Date.now() }],
      });
      const ack1 = await r1.waitFor('report_ack');
      expect(ack1.reportId).toMatch(/[0-9a-f-]{36}/);
      // duplicate report of the same pair by the same reporter does not count twice
      r1.send({ type: 'report', reason: 'spam' });
      await r1.waitFor('report_ack');
      r1.send({ type: 'stop' });
      await r1.waitFor('idle');
      await offender.waitFor('partner_left');

      const r2 = await TestClient.connect(banApp.port);
      await r2.hello();
      offender.send({ type: 'next' });
      await offender.waitFor('queued');
      await r2.find('text');
      await Promise.all([offender.waitFor('matched'), r2.waitFor('matched')]);
      r2.send({ type: 'report', reason: 'nudity' });
      await r2.waitFor('report_ack');

      const banned = await offender.waitFor('banned');
      expect(banned.expiresAt).toBeGreaterThan(Date.now());
      expect((await offender.closed).code).toBe(CloseCode.BANNED);
      expect((await r2.waitFor('partner_left')).reason).toBe('moderated');

      const again = await TestClient.connect(banApp.port, { clientId: offender.clientId });
      again.send({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        clientId: offender.clientId,
        ageConfirmed: true,
        termsAccepted: true,
      });
      await again.waitFor('banned');
      expect((await again.closed).code).toBe(CloseCode.BANNED);

      const reports = await banApp.pool.query(
        'SELECT reason, reported_hash, transcript FROM reports ORDER BY created_at',
      );
      expect(reports.rowCount).toBe(2);
      expect(reports.rows[0].reason).toBe('spam'); // updated by the duplicate report
      expect(reports.rows[0].reported_hash).toBe(hashClientId(offender.clientId, secret));
      expect(reports.rows[0].transcript).toEqual([expect.objectContaining({ text: 'bad words' })]);
      const bans = await banApp.pool.query(
        'SELECT source, subject_type FROM bans WHERE revoked_at IS NULL',
      );
      expect(bans.rows).toEqual([{ source: 'auto', subject_type: 'client' }]);
      const actions = await banApp.pool.query('SELECT action FROM moderation_actions');
      expect(actions.rows.map((r) => r.action)).toEqual(['auto_ban']);
      for (const x of [r1, r2]) x.close();
    } finally {
      await banApp.stop();
    }
  });

  it('caps connections per IP', async () => {
    const capped = await startTestApp({
      MAX_CONNECTIONS_PER_IP: '2',
      NODE_ID: 'node-c',
      IDENTITY_SECRET: 'another-secret-so-conn-keys-are-separate',
    });
    try {
      const c1 = await TestClient.connect(capped.port);
      const c2 = await TestClient.connect(capped.port);
      const c3 = await TestClient.connect(capped.port);
      expect((await c3.waitFor('error')).code).toBe('too_many_connections');
      expect((await c3.closed).code).toBe(CloseCode.TOO_MANY_CONNECTIONS);
      c1.close();
      await c1.closed;
      await new Promise((r) => setTimeout(r, 100));
      const c4 = await TestClient.connect(capped.port);
      await c4.hello();
      c2.close();
      c4.close();
    } finally {
      await capped.stop();
    }
  });

  it('delivers across two server nodes sharing Redis', async () => {
    const other = await startTestApp({ NODE_ID: 'node-2' });
    try {
      const a = await TestClient.connect(app.port);
      const b = await TestClient.connect(other.port);
      await a.hello();
      await b.hello();
      await a.find('text');
      await b.find('text');
      const [ma, mb] = await Promise.all([a.waitFor('matched'), b.waitFor('matched')]);
      expect(ma.pairId).toBe(mb.pairId);
      a.send({ type: 'message', text: 'cross-node' });
      expect((await b.waitFor('message')).text).toBe('cross-node');
      b.send({ type: 'next' });
      expect((await a.waitFor('partner_left')).reason).toBe('next');
      await b.waitFor('queued');
      const welcomeCount = (await TestClient.connect(other.port).then((c) => c.hello()))
        .onlineCount;
      expect(welcomeCount).toBeGreaterThanOrEqual(3);
      a.close();
      b.close();
    } finally {
      await other.stop();
    }
  });
});
