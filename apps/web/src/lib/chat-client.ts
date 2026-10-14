import {
  CloseCode,
  PROTOCOL_VERSION,
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from '@stranger/protocol';

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface ChatClientOptions {
  url: string;
  clientId: string;
  consent: () => { ageConfirmed: boolean; termsAccepted: boolean };
  /** Injectable for tests. */
  WebSocketImpl?: typeof WebSocket;
  maxBackoffMs?: number;
}

type FrameListener = (frame: ServerMessage) => void;
type StateListener = (state: ConnectionState, detail?: { code?: number; reason?: string }) => void;

/** Close codes after which reconnecting is pointless. */
const FATAL_CLOSE_CODES = new Set<number>([
  CloseCode.BANNED,
  CloseCode.TOO_MANY_CONNECTIONS,
  CloseCode.ORIGIN_NOT_ALLOWED,
  CloseCode.ABUSE,
]);

/**
 * Reconnecting WebSocket wrapper that speaks the STRANGER protocol. Every inbound frame is
 * validated; anything unexpected is dropped and logged rather than reaching the UI.
 */
export class ChatClient {
  state: ConnectionState = 'idle';
  private ws: WebSocket | null = null;
  private frameListeners = new Set<FrameListener>();
  private stateListeners = new Set<StateListener>();
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wantOpen = false;
  private readonly WS: typeof WebSocket;
  private readonly maxBackoff: number;

  constructor(private readonly opts: ChatClientOptions) {
    this.WS = opts.WebSocketImpl ?? WebSocket;
    this.maxBackoff = opts.maxBackoffMs ?? 10_000;
  }

  connect(): void {
    this.wantOpen = true;
    if (
      this.ws &&
      (this.ws.readyState === this.WS.OPEN || this.ws.readyState === this.WS.CONNECTING)
    )
      return;
    this.open();
  }

  disconnect(): void {
    this.wantOpen = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close(1000, 'client closed');
    }
    this.setState('closed');
  }

  /** Returns false when the socket is not open (callers decide whether to queue or drop). */
  send(msg: ClientMessage): boolean {
    if (!this.ws || this.ws.readyState !== this.WS.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  onFrame(fn: FrameListener): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  onState(fn: StateListener): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  private open(): void {
    this.setState(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const ws = new this.WS(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempts = 0;
      const consent = this.opts.consent();
      ws.send(
        JSON.stringify({
          type: 'hello',
          protocolVersion: PROTOCOL_VERSION,
          clientId: this.opts.clientId,
          ageConfirmed: consent.ageConfirmed,
          termsAccepted: consent.termsAccepted,
        } satisfies ClientMessage),
      );
      this.setState('open');
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      let json: unknown;
      try {
        json = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        console.warn('chat: dropped non-JSON frame');
        return;
      }
      const parsed = parseServerMessage(json);
      if (!parsed.success) {
        console.warn('chat: dropped invalid frame', json);
        return;
      }
      for (const fn of this.frameListeners) fn(parsed.data);
    };
    ws.onerror = () => {
      /* onclose follows; nothing useful in the error event */
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.wantOpen || FATAL_CLOSE_CODES.has(ev.code)) {
        this.wantOpen = false;
        this.setState('closed', { code: ev.code, reason: ev.reason });
        return;
      }
      this.scheduleReconnect(ev);
    };
  }

  private scheduleReconnect(ev: CloseEvent): void {
    this.attempts += 1;
    const delay =
      Math.min(this.maxBackoff, 500 * 2 ** Math.min(this.attempts - 1, 5)) + Math.random() * 250;
    this.setState('reconnecting', { code: ev.code, reason: ev.reason });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.wantOpen) this.open();
    }, delay);
  }

  private setState(state: ConnectionState, detail?: { code?: number; reason?: string }): void {
    this.state = state;
    for (const fn of this.stateListeners) fn(state, detail);
  }
}
