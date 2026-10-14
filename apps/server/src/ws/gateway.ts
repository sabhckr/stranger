import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import type { Redis } from 'ioredis';
import {
  CloseCode,
  parseClientMessage,
  type ChatMode,
  type ClientMessage,
  type ClientMessageOf,
  type PartnerLeftReason,
  type ServerMessage,
} from '@stranger/protocol';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { clientIpFrom, hashClientId, hashIpDaily, hashIpStable } from '../identity.js';
import { createSessionLimits, type SessionLimits } from '../safety/rate-limit.js';
import { MessageSpamFilter } from '../safety/spam.js';
import type { Matchmaker, MatchEvent, MatchSide, Ticket } from '../matchmaking/matchmaker.js';
import type { Relay, RelayEvent, BanEvent } from '../session/relay.js';
import type { Presence } from '../session/presence.js';
import type { BanService } from '../safety/bans.js';
import type { BlockService } from '../safety/blocks.js';
import type { ModerationService } from '../safety/moderation.js';

export type SessionState = 'handshake' | 'idle' | 'queued' | 'matched';

export interface PairState {
  pairId: string;
  mode: ChatMode;
  partner: MatchSide;
  initiator: boolean;
  startedAt: number;
}

export interface LastPair {
  pairId: string;
  mode: ChatMode;
  partnerClientHash: string;
  endedAt: number;
}

export interface Session {
  id: string;
  ws: WebSocket;
  ip: string;
  ipDaily: string;
  clientHash: string | null;
  consent: boolean;
  state: SessionState;
  mode: ChatMode | null;
  interests: string[];
  ticketId: string | null;
  pair: PairState | null;
  lastPair: LastPair | null;
  limits: SessionLimits;
  spam: MessageSpamFilter;
  alive: boolean;
  closeReason: PartnerLeftReason | null;
  handshakeTimer: NodeJS.Timeout | null;
  connectedAt: number;
}

export interface GatewayDeps {
  config: Config;
  log: Logger;
  redis: Redis;
  matchmaker: Matchmaker;
  relay: Relay;
  presence: Presence;
  bans: BanService;
  blocks: BlockService;
  moderation: ModerationService;
}

const MAX_PAYLOAD_BYTES = 128 * 1024;
const PRESENCE_BROADCAST_MS = 5_000;

export class Gateway {
  readonly sessions = new Map<string, Session>();
  private readonly wss: WebSocketServer;
  private readonly timers: NodeJS.Timeout[] = [];
  private sweeping = false;
  private closing = false;

  constructor(private readonly deps: GatewayDeps) {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PAYLOAD_BYTES,
      clientTracking: false,
    });
  }

  // ------------------------------------------------------------------ lifecycle
  attach(server: HttpServer, path = '/ws'): void {
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== path) {
        socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      this.handleUpgrade(req, socket, head);
    });
  }

  start(): void {
    const { config } = this.deps;
    const heartbeat = setInterval(() => this.heartbeat(), config.HEARTBEAT_INTERVAL_MS);
    const sweep = setInterval(() => void this.sweep(), config.MATCH_SWEEP_INTERVAL_MS);
    const presence = setInterval(() => void this.broadcastPresence(), PRESENCE_BROADCAST_MS);
    for (const t of [heartbeat, sweep, presence]) t.unref();
    this.timers.push(heartbeat, sweep, presence);
  }

  async stop(): Promise<void> {
    this.closing = true;
    for (const t of this.timers) clearInterval(t);
    const closes = [...this.sessions.values()].map(async (s) => {
      await this.cleanupSession(s, 'disconnected');
      s.ws.close(CloseCode.SERVER_SHUTDOWN, 'server shutting down');
    });
    await Promise.allSettled(closes);
    this.wss.close();
  }

  localCount(): number {
    return this.sessions.size;
  }

  // ------------------------------------------------------------------ connection
  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const { config, log } = this.deps;
    const origin = req.headers.origin;
    if (origin && !config.PUBLIC_ORIGINS.includes(origin)) {
      log.warn({ origin }, 'ws: origin rejected');
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (this.closing) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => void this.onConnection(ws, req));
  }

  private async onConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const { config, log, redis, bans } = this.deps;
    const ip = clientIpFrom(req.headers, req.socket.remoteAddress, config.TRUST_PROXY);
    const session: Session = {
      id: randomUUID(),
      ws,
      ip,
      ipDaily: hashIpDaily(ip, config.IDENTITY_SECRET),
      clientHash: null,
      consent: false,
      state: 'handshake',
      mode: null,
      interests: [],
      ticketId: null,
      pair: null,
      lastPair: null,
      limits: createSessionLimits(),
      spam: new MessageSpamFilter({
        maxLength: config.MAX_MESSAGE_LENGTH,
        maxRepeats: 2,
        maxLinksPerWindow: 3,
        linkWindowMs: 60_000,
      }),
      alive: true,
      closeReason: null,
      handshakeTimer: null,
      connectedAt: Date.now(),
    };

    // Hold inbound frames until admission checks are done so an eager `hello` is never lost.
    ws.pause();

    // Per-IP connection cap (daily-rotating hash; the raw IP is never written to Redis).
    const connKey = `conn:${session.ipDaily}`;
    let counted = false;
    try {
      const n = await redis.incr(connKey);
      await redis.expire(connKey, 3600);
      counted = true;
      if (n > config.MAX_CONNECTIONS_PER_IP) {
        this.send(session, {
          type: 'error',
          code: 'too_many_connections',
          message: 'Too many connections from your network.',
        });
        ws.resume(); // a paused socket cannot complete the close handshake
        ws.close(CloseCode.TOO_MANY_CONNECTIONS, 'too many connections');
        await this.releaseConnectionSlot(connKey);
        return;
      }
      const ipBan = await bans.isBanned('ip', hashIpStable(ip, config.IDENTITY_SECRET));
      if (ipBan) {
        this.send(session, { type: 'banned', reason: ipBan.reason, expiresAt: ipBan.expiresAt });
        ws.resume();
        ws.close(CloseCode.BANNED, 'banned');
        await this.releaseConnectionSlot(connKey);
        return;
      }
    } catch (err) {
      log.error({ err }, 'ws: connection admission failed');
      ws.resume();
      ws.close(CloseCode.INVALID_PROTOCOL, 'server error');
      if (counted) await this.releaseConnectionSlot(connKey);
      return;
    }

    this.sessions.set(session.id, session);
    void this.deps.presence.publish().catch(() => undefined);
    session.handshakeTimer = setTimeout(() => {
      if (session.state === 'handshake') ws.close(CloseCode.HANDSHAKE_TIMEOUT, 'handshake timeout');
    }, config.HANDSHAKE_TIMEOUT_MS);

    ws.on('pong', () => {
      session.alive = true;
    });
    ws.on('message', (data, isBinary) => {
      session.alive = true;
      if (isBinary) {
        this.violation(session, 'binary frames are not supported');
        return;
      }
      void this.onMessage(session, data.toString());
    });
    ws.on('error', (err) => log.debug({ err, session: session.id }, 'ws: socket error'));
    ws.on('close', () => {
      void this.onClose(session, connKey);
    });
    ws.resume();
    log.debug({ session: session.id }, 'ws: connected');
  }

  private async onClose(session: Session, connKey: string): Promise<void> {
    if (session.handshakeTimer) clearTimeout(session.handshakeTimer);
    this.sessions.delete(session.id);
    void this.deps.presence.publish().catch(() => undefined);
    await this.cleanupSession(session, session.closeReason ?? 'disconnected');
    await this.releaseConnectionSlot(connKey);
    this.deps.log.debug({ session: session.id }, 'ws: closed');
  }

  private async releaseConnectionSlot(connKey: string): Promise<void> {
    try {
      const n = await this.deps.redis.decr(connKey);
      if (n < 0) await this.deps.redis.del(connKey); // counter was reset underneath us
    } catch {
      /* best effort */
    }
  }

  /** Leave the queue and/or end the current pair. Safe to call multiple times. */
  private async cleanupSession(session: Session, reason: PartnerLeftReason): Promise<void> {
    if (session.ticketId) {
      const id = session.ticketId;
      session.ticketId = null;
      await this.deps.matchmaker
        .dequeue(id)
        .catch((err) => this.deps.log.warn({ err }, 'dequeue failed'));
    }
    if (session.pair) await this.endPair(session, reason);
  }

  // ------------------------------------------------------------------ inbound
  private async onMessage(session: Session, raw: string): Promise<void> {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.violation(session, 'invalid JSON');
      return;
    }
    const parsed = parseClientMessage(json);
    if (!parsed.success) {
      this.violation(session, 'invalid message');
      return;
    }
    const msg = parsed.data;
    if (session.state === 'handshake' && msg.type !== 'hello') {
      this.send(session, {
        type: 'error',
        code: 'handshake_required',
        message: 'Send hello first.',
      });
      return;
    }
    try {
      switch (msg.type) {
        case 'hello':
          return await this.handleHello(session, msg);
        case 'find':
          return await this.handleFind(session, msg);
        case 'cancel':
          return await this.handleCancel(session);
        case 'message':
          return await this.handleChatMessage(session, msg);
        case 'typing':
          return await this.handleTyping(session, msg);
        case 'next':
          return await this.handleNext(session);
        case 'stop':
          return await this.handleStop(session);
        case 'signal':
          return await this.handleSignal(session, msg);
        case 'report':
          return await this.handleReport(session, msg);
        case 'block':
          return await this.handleBlock(session, msg);
        case 'ping':
          if (this.limited(session, session.limits.misc)) return;
          this.send(session, { type: 'pong' });
          return;
      }
    } catch (err) {
      this.deps.log.error({ err, session: session.id, type: msg.type }, 'ws: handler failed');
      this.send(session, {
        type: 'error',
        code: 'server_error',
        message: 'Something went wrong. Please try again.',
      });
    }
  }

  private violation(session: Session, message: string): void {
    const r = session.limits.violations.take();
    this.send(session, { type: 'error', code: 'invalid_message', message });
    if (!r.ok) session.ws.close(CloseCode.ABUSE, 'too many protocol violations');
  }

  private limited(session: Session, bucket: SessionLimits[keyof SessionLimits]): boolean {
    const r = bucket.take();
    if (r.ok) return false;
    this.send(session, {
      type: 'error',
      code: 'rate_limited',
      message: 'Slow down a little.',
      retryAfterMs: r.retryAfterMs,
    });
    return true;
  }

  private async handleHello(session: Session, msg: ClientMessageOf<'hello'>): Promise<void> {
    const { config, bans, blocks, presence } = this.deps;
    if (session.state !== 'handshake') {
      this.violation(session, 'hello already received');
      return;
    }
    const clientHash = hashClientId(msg.clientId, config.IDENTITY_SECRET);
    const ban = await bans.isBanned('client', clientHash);
    if (ban) {
      this.send(session, { type: 'banned', reason: ban.reason, expiresAt: ban.expiresAt });
      session.ws.close(CloseCode.BANNED, 'banned');
      return;
    }
    if (session.handshakeTimer) clearTimeout(session.handshakeTimer);
    session.handshakeTimer = null;
    session.clientHash = clientHash;
    session.consent = msg.ageConfirmed && msg.termsAccepted;
    session.state = 'idle';
    await blocks.warmCache(clientHash);
    const onlineCount = await presence.onlineCount().catch(() => this.localCount());
    this.send(session, {
      type: 'welcome',
      sessionId: session.id,
      onlineCount,
      maxMessageLength: config.MAX_MESSAGE_LENGTH,
      features: { video: true, turn: config.turnEnabled },
    });
  }

  private async handleFind(session: Session, msg: ClientMessageOf<'find'>): Promise<void> {
    if (!session.consent) {
      this.send(session, {
        type: 'error',
        code: 'consent_required',
        message: 'Confirm you are 18+ and accept the terms first.',
      });
      return;
    }
    if (session.state === 'queued') {
      this.send(session, {
        type: 'error',
        code: 'already_searching',
        message: 'Already looking for someone.',
      });
      return;
    }
    if (this.limited(session, session.limits.navigation)) return;
    if (session.pair) await this.endPair(session, 'next');
    session.mode = msg.mode;
    session.interests = msg.interests;
    await this.enqueue(session);
  }

  private async enqueue(session: Session): Promise<void> {
    if (!session.clientHash || !session.mode) return;
    const ticket: Ticket = {
      ticketId: randomUUID(),
      sessionId: session.id,
      nodeId: this.deps.config.NODE_ID,
      clientHash: session.clientHash,
      mode: session.mode,
      interests: session.interests,
      ...(session.lastPair ? { lastPartner: session.lastPair.partnerClientHash } : {}),
    };
    session.ticketId = ticket.ticketId;
    session.state = 'queued';
    await this.deps.matchmaker.enqueue(ticket);
    this.send(session, { type: 'queued', mode: session.mode, interests: session.interests });
    // A successful match is announced on the MATCH_CHANNEL and applied by onMatch() on every node,
    // including this one, so it is deliberately not applied from the return value here.
    await this.deps.matchmaker.tryMatch(ticket);
  }

  private async handleCancel(session: Session): Promise<void> {
    if (this.limited(session, session.limits.navigation)) return;
    if (session.state === 'queued' && session.ticketId) {
      const id = session.ticketId;
      session.ticketId = null;
      session.state = 'idle';
      const removed = await this.deps.matchmaker.dequeue(id);
      if (!removed && session.state !== 'idle') return; // matched meanwhile; `matched` is on its way
    }
    if (session.state === 'idle') this.send(session, { type: 'idle' });
  }

  private async handleChatMessage(
    session: Session,
    msg: ClientMessageOf<'message'>,
  ): Promise<void> {
    if (!session.pair) {
      this.send(session, {
        type: 'error',
        code: 'not_matched',
        message: 'You are not chatting with anyone.',
      });
      return;
    }
    if (this.limited(session, session.limits.message)) return;
    const verdict = session.spam.check(msg.text);
    if (!verdict.ok) {
      const messages: Record<typeof verdict.reason, string> = {
        empty: 'Message is empty.',
        too_long: 'Message is too long.',
        repeated: 'Please do not repeat the same message.',
        links: 'Too many links. Try again in a minute.',
      };
      this.send(session, {
        type: 'error',
        code: 'message_blocked',
        message: messages[verdict.reason],
      });
      return;
    }
    await this.relayToPartner(session, { type: 'message', text: verdict.text, ts: Date.now() });
  }

  private async handleTyping(session: Session, msg: ClientMessageOf<'typing'>): Promise<void> {
    if (!session.pair) return;
    if (!session.limits.typing.take().ok) return; // silently drop
    await this.relayToPartner(session, { type: 'typing', isTyping: msg.isTyping });
  }

  private async handleSignal(session: Session, msg: ClientMessageOf<'signal'>): Promise<void> {
    if (!session.pair || session.pair.mode !== 'video') {
      this.send(session, { type: 'error', code: 'not_matched', message: 'No video partner.' });
      return;
    }
    if (this.limited(session, session.limits.signal)) return;
    await this.relayToPartner(session, { type: 'signal', data: msg.data });
  }

  private async handleNext(session: Session): Promise<void> {
    if (!session.consent) {
      this.send(session, {
        type: 'error',
        code: 'consent_required',
        message: 'Confirm you are 18+ and accept the terms first.',
      });
      return;
    }
    if (session.state === 'queued') {
      if (session.mode)
        this.send(session, { type: 'queued', mode: session.mode, interests: session.interests });
      return;
    }
    if (this.limited(session, session.limits.navigation)) return;
    if (!session.mode) {
      this.send(session, {
        type: 'error',
        code: 'not_matched',
        message: 'Choose text or video first.',
      });
      return;
    }
    if (session.pair) await this.endPair(session, 'next');
    await this.enqueue(session);
  }

  private async handleStop(session: Session): Promise<void> {
    if (this.limited(session, session.limits.navigation)) return;
    if (session.ticketId) {
      const id = session.ticketId;
      session.ticketId = null;
      await this.deps.matchmaker.dequeue(id);
    }
    if (session.pair) await this.endPair(session, 'stop');
    session.state = 'idle';
    this.send(session, { type: 'idle' });
  }

  private resolveTarget(
    session: Session,
    pairId: string | undefined,
  ): { pairId: string; mode: ChatMode; partnerHash: string } | null {
    const current = session.pair;
    const last = session.lastPair;
    if (pairId) {
      if (current && current.pairId === pairId)
        return { pairId, mode: current.mode, partnerHash: current.partner.clientHash };
      if (last && last.pairId === pairId)
        return { pairId, mode: last.mode, partnerHash: last.partnerClientHash };
      return null;
    }
    if (current)
      return {
        pairId: current.pairId,
        mode: current.mode,
        partnerHash: current.partner.clientHash,
      };
    if (last) return { pairId: last.pairId, mode: last.mode, partnerHash: last.partnerClientHash };
    return null;
  }

  private async handleReport(session: Session, msg: ClientMessageOf<'report'>): Promise<void> {
    if (!session.clientHash) return;
    const target = this.resolveTarget(session, msg.pairId);
    if (!target) {
      this.send(session, {
        type: 'error',
        code: 'not_matched',
        message: 'There is nobody to report.',
      });
      return;
    }
    if (this.limited(session, session.limits.report)) return;
    const { config, moderation, relay, log } = this.deps;
    const outcome = await moderation.handleReport({
      pairId: target.pairId,
      mode: target.mode,
      reporterHash: session.clientHash,
      reportedHash: target.partnerHash,
      reporterIpHash: hashIpStable(session.ip, config.IDENTITY_SECRET),
      reason: msg.reason,
      ...(msg.details !== undefined ? { details: msg.details } : {}),
      ...(msg.transcript !== undefined ? { transcript: msg.transcript } : {}),
    });
    this.send(session, { type: 'report_ack', reportId: outcome.reportId });
    log.info(
      {
        reportId: outcome.reportId,
        reason: msg.reason,
        isNew: outcome.isNew,
        autoBan: Boolean(outcome.autoBan),
      },
      'report received',
    );
    if (outcome.autoBan) {
      await relay.broadcastBan({
        clientHash: target.partnerHash,
        reason: 'You have been temporarily suspended after multiple reports.',
        expiresAt: outcome.autoBan.expiresAt,
      });
    }
  }

  private async handleBlock(session: Session, msg: ClientMessageOf<'block'>): Promise<void> {
    if (!session.clientHash) return;
    const target = this.resolveTarget(session, msg.pairId);
    if (!target) {
      this.send(session, {
        type: 'error',
        code: 'not_matched',
        message: 'There is nobody to block.',
      });
      return;
    }
    if (this.limited(session, session.limits.report)) return;
    await this.deps.blocks.block(session.clientHash, target.partnerHash);
    this.send(session, { type: 'block_ack' });
    if (session.pair && session.pair.pairId === target.pairId) {
      // The other side only learns that the chat ended.
      await this.endPair(session, 'disconnected');
      session.state = 'idle';
      this.send(session, { type: 'idle' });
    }
  }

  // ------------------------------------------------------------------ pairs
  private applyMatch(event: MatchEvent): void {
    const { config } = this.deps;
    const sides: Array<{ me: MatchSide; other: MatchSide; initiator: boolean }> = [
      { me: event.a, other: event.b, initiator: true },
      { me: event.b, other: event.a, initiator: false },
    ];
    for (const { me, other, initiator } of sides) {
      if (me.nodeId !== config.NODE_ID) continue;
      const session = this.sessions.get(me.sessionId);
      if (session?.pair?.pairId === event.pairId) continue; // already applied
      if (!session || session.ws.readyState !== WebSocket.OPEN) {
        // Our side vanished between pairing and delivery: release the partner immediately.
        void this.deps.relay.send(other.nodeId, {
          kind: 'partner_left',
          to: other.sessionId,
          pairId: event.pairId,
          reason: 'disconnected',
        });
        continue;
      }
      session.ticketId = null;
      session.state = 'matched';
      session.pair = {
        pairId: event.pairId,
        mode: event.mode,
        partner: other,
        initiator,
        startedAt: Date.now(),
      };
      this.send(session, {
        type: 'matched',
        pairId: event.pairId,
        mode: event.mode,
        sharedInterests: event.sharedInterests,
        initiator,
      });
    }
  }

  private async endPair(session: Session, reason: PartnerLeftReason): Promise<void> {
    const pair = session.pair;
    if (!pair) return;
    session.pair = null;
    session.lastPair = {
      pairId: pair.pairId,
      mode: pair.mode,
      partnerClientHash: pair.partner.clientHash,
      endedAt: Date.now(),
    };
    if (session.state === 'matched') session.state = 'idle';
    await this.deps.relay.send(pair.partner.nodeId, {
      kind: 'partner_left',
      to: pair.partner.sessionId,
      pairId: pair.pairId,
      reason,
    });
  }

  private async relayToPartner(session: Session, frame: ServerMessage): Promise<void> {
    const pair = session.pair;
    if (!pair) return;
    await this.deps.relay.send(pair.partner.nodeId, {
      kind: 'frame',
      to: pair.partner.sessionId,
      pairId: pair.pairId,
      frame,
    });
  }

  // ------------------------------------------------------------------ relay handlers (any node)
  onRelayEvent(event: RelayEvent): void {
    const session = this.sessions.get(event.to);
    if (!session) return;
    if (event.kind === 'frame') {
      if (session.pair?.pairId !== event.pairId) return; // stale frame from a previous pair
      this.send(session, event.frame);
      return;
    }
    if (event.kind === 'partner_left') {
      const pair = session.pair;
      if (!pair || pair.pairId !== event.pairId) return;
      session.pair = null;
      session.lastPair = {
        pairId: pair.pairId,
        mode: pair.mode,
        partnerClientHash: pair.partner.clientHash,
        endedAt: Date.now(),
      };
      session.state = 'idle';
      this.send(session, { type: 'partner_left', reason: event.reason });
    }
  }

  onMatch(event: MatchEvent): void {
    this.applyMatch(event);
  }

  onBan(event: BanEvent): void {
    for (const session of this.sessions.values()) {
      if (session.clientHash !== event.clientHash) continue;
      session.closeReason = 'moderated';
      this.send(session, { type: 'banned', reason: event.reason, expiresAt: event.expiresAt });
      session.ws.close(CloseCode.BANNED, 'banned');
    }
  }

  // ------------------------------------------------------------------ periodic
  private heartbeat(): void {
    for (const session of this.sessions.values()) {
      if (!session.alive) {
        session.ws.terminate();
        continue;
      }
      session.alive = false;
      if (session.ws.readyState === WebSocket.OPEN) session.ws.ping();
    }
  }

  /** Re-run matching for every local waiting ticket (handles the interest-fallback timeout). */
  async sweep(now = Date.now()): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (const session of this.sessions.values()) {
        if (session.state !== 'queued' || !session.ticketId || !session.clientHash || !session.mode)
          continue;
        const ticket: Ticket = {
          ticketId: session.ticketId,
          sessionId: session.id,
          nodeId: this.deps.config.NODE_ID,
          clientHash: session.clientHash,
          mode: session.mode,
          interests: session.interests,
        };
        await this.deps.matchmaker.tryMatch(ticket, now);
      }
    } catch (err) {
      this.deps.log.warn({ err }, 'sweep failed');
    } finally {
      this.sweeping = false;
    }
  }

  private async broadcastPresence(): Promise<void> {
    if (this.sessions.size === 0) return;
    const onlineCount = await this.deps.presence.onlineCount().catch(() => this.localCount());
    for (const session of this.sessions.values()) {
      if (session.state !== 'handshake') this.send(session, { type: 'presence', onlineCount });
    }
  }

  // ------------------------------------------------------------------ outbound
  private send(session: Session, frame: ServerMessage): void {
    if (session.ws.readyState !== WebSocket.OPEN) return;
    session.ws.send(JSON.stringify(frame));
  }
}

export type { ClientMessage };
