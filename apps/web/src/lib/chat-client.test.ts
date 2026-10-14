import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloseCode } from '@stranger/protocol';
import { ChatClient } from './chat-client.js';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: '' });
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
  }
  drop(code: number, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

function makeClient() {
  return new ChatClient({
    url: 'ws://test/ws',
    clientId: '7a6d8a2e-0d5c-4b1a-9a4e-1f3d0b2c9e11',
    consent: () => ({ ageConfirmed: true, termsAccepted: true }),
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    maxBackoffMs: 2000,
  });
}

describe('ChatClient', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends hello with consent on open and reports state', () => {
    const client = makeClient();
    const states: string[] = [];
    client.onState((s) => states.push(s));
    client.connect();
    const sock = FakeSocket.instances[0]!;
    expect(states).toEqual(['connecting']);
    sock.open();
    expect(states).toEqual(['connecting', 'open']);
    expect(JSON.parse(sock.sent[0]!)).toMatchObject({
      type: 'hello',
      ageConfirmed: true,
      termsAccepted: true,
      protocolVersion: 1,
    });
    expect(client.send({ type: 'ping' })).toBe(true);
    expect(sock.sent).toHaveLength(2);
  });

  it('delivers only valid frames', () => {
    const client = makeClient();
    const frames: unknown[] = [];
    client.onFrame((f) => frames.push(f));
    client.connect();
    const sock = FakeSocket.instances[0]!;
    sock.open();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sock.receive('not json');
    sock.receive({ type: 'bogus' });
    sock.receive({ type: 'presence', onlineCount: -1 });
    sock.receive({ type: 'presence', onlineCount: 12 });
    expect(frames).toEqual([{ type: 'presence', onlineCount: 12 }]);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('reconnects with backoff after an unexpected close, but not after a ban', () => {
    const client = makeClient();
    const states: string[] = [];
    client.onState((s) => states.push(s));
    client.connect();
    FakeSocket.instances[0]!.open();
    FakeSocket.instances[0]!.drop(1006);
    expect(client.state).toBe('reconnecting');
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(800);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1]!.open();
    expect(client.state).toBe('open');

    FakeSocket.instances[1]!.drop(CloseCode.BANNED, 'banned');
    expect(client.state).toBe('closed');
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(client.send({ type: 'ping' })).toBe(false);
  });

  it('disconnect() closes and never reconnects', () => {
    const client = makeClient();
    client.connect();
    FakeSocket.instances[0]!.open();
    client.disconnect();
    expect(client.state).toBe('closed');
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
