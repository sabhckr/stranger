import type { Redis } from 'ioredis';
import type { PartnerLeftReason, ServerMessage } from '@stranger/protocol';
import type { Logger } from '../logger.js';
import { MATCH_CHANNEL, type MatchEvent } from '../matchmaking/matchmaker.js';

export const BAN_CHANNEL = 'mod:ban';

/** Events delivered to a specific session, possibly living on another node. */
export type RelayEvent =
  | { kind: 'frame'; to: string; pairId: string; frame: ServerMessage }
  | { kind: 'partner_left'; to: string; pairId: string; reason: PartnerLeftReason };

export interface BanEvent {
  clientHash: string;
  reason: string;
  expiresAt: number | null;
}

export interface RelayHandlers {
  onEvent(event: RelayEvent): void;
  onMatch(event: MatchEvent): void;
  onBan(event: BanEvent): void;
}

/** Cross-node delivery via Redis pub/sub. Same-node delivery short-circuits in memory. */
export class Relay {
  private readonly channel: string;

  constructor(
    private readonly pub: Redis,
    private readonly sub: Redis,
    private readonly nodeId: string,
    private readonly handlers: RelayHandlers,
    private readonly log: Logger,
  ) {
    this.channel = `node:${nodeId}`;
  }

  async start(): Promise<void> {
    await this.sub.subscribe(this.channel, MATCH_CHANNEL, BAN_CHANNEL);
    this.sub.on('message', (channel: string, raw: string) => {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (channel === MATCH_CHANNEL) this.handlers.onMatch(parsed as MatchEvent);
        else if (channel === BAN_CHANNEL) this.handlers.onBan(parsed as BanEvent);
        else if (channel === this.channel) this.handlers.onEvent(parsed as RelayEvent);
      } catch (err) {
        this.log.warn({ err, channel }, 'relay: dropped malformed message');
      }
    });
  }

  async stop(): Promise<void> {
    await this.sub.unsubscribe().catch(() => undefined);
  }

  /** Deliver an event to a session on `nodeId`. */
  async send(nodeId: string, event: RelayEvent): Promise<void> {
    if (nodeId === this.nodeId) {
      this.handlers.onEvent(event);
      return;
    }
    await this.pub.publish(`node:${nodeId}`, JSON.stringify(event));
  }

  async broadcastBan(event: BanEvent): Promise<void> {
    await this.pub.publish(BAN_CHANNEL, JSON.stringify(event));
  }
}
