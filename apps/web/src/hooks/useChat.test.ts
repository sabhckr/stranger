import { describe, expect, it } from 'vitest';
import { chatReducer, initialChatState, type ChatState } from './useChat.js';

function run(state: ChatState, ...frames: Parameters<typeof chatReducer>[1][]): ChatState {
  return frames.reduce((s, a) => chatReducer(s, a), state);
}

describe('chatReducer', () => {
  it('tracks the matchmaking lifecycle', () => {
    let s = run(
      initialChatState,
      {
        type: 'frame',
        frame: {
          type: 'welcome',
          sessionId: 's',
          onlineCount: 7,
          maxMessageLength: 500,
          features: { video: true, turn: false },
        },
      },
      { type: 'start', mode: 'text', interests: ['music'] },
    );
    expect(s.status).toBe('searching');
    expect(s.onlineCount).toBe(7);
    expect(s.maxMessageLength).toBe(500);

    s = run(s, {
      type: 'frame',
      frame: {
        type: 'matched',
        pairId: 'p1',
        mode: 'text',
        sharedInterests: ['music'],
        initiator: true,
      },
    });
    expect(s.status).toBe('chatting');
    expect(s.pair?.pairId).toBe('p1');
    expect(s.messages.map((m) => m.kind)).toEqual(['system']);
    expect(s.messages[0]!.text).toContain('music');

    s = run(
      s,
      { type: 'local_message', text: 'hi' },
      { type: 'frame', frame: { type: 'typing', isTyping: true } },
    );
    expect(s.partnerTyping).toBe(true);
    s = run(s, { type: 'frame', frame: { type: 'message', text: 'hello', ts: 1 } });
    expect(s.partnerTyping).toBe(false);
    expect(s.messages.map((m) => [m.kind, m.text])).toEqual([
      ['system', expect.any(String)],
      ['me', 'hi'],
      ['partner', 'hello'],
    ]);

    s = run(s, { type: 'frame', frame: { type: 'partner_left', reason: 'next' } });
    expect(s.status).toBe('ended');
    expect(s.pair).toBeNull();
    expect(s.lastPairId).toBe('p1');
    expect(s.messages.at(-1)!.text).toBe('Stranger has left the chat.');
  });

  it('marks the chat ended when the connection drops mid-chat', () => {
    let s = run(
      initialChatState,
      { type: 'start', mode: 'video', interests: [] },
      {
        type: 'frame',
        frame: {
          type: 'matched',
          pairId: 'p',
          mode: 'video',
          sharedInterests: [],
          initiator: false,
        },
      },
    );
    s = run(s, { type: 'connection', state: 'reconnecting' });
    expect(s.status).toBe('ended');
    expect(s.messages.at(-1)!.text).toMatch(/Connection lost/);
  });

  it('surfaces errors, acks and bans as notices', () => {
    let s = run(initialChatState, {
      type: 'frame',
      frame: { type: 'error', code: 'consent_required', message: 'Confirm first' },
    });
    expect(s.notices).toEqual([expect.objectContaining({ tone: 'error', text: 'Confirm first' })]);
    s = run(s, { type: 'clear_notice', id: s.notices[0]!.id });
    expect(s.notices).toEqual([]);
    s = run(s, { type: 'frame', frame: { type: 'report_ack', reportId: 'r1' } });
    expect(s.reportAck).toBe('r1');
    expect(s.notices.map((n) => n.tone)).toEqual(['success']);
    s = run(s, { type: 'frame', frame: { type: 'block_ack' } });
    expect(s.notices.map((n) => n.text)).toEqual([
      expect.stringMatching(/report has been received/),
      expect.stringMatching(/^Blocked/),
    ]);
    s = run(s, { type: 'frame', frame: { type: 'banned', reason: 'nope', expiresAt: null } });
    expect(s.banned).toEqual({ reason: 'nope', expiresAt: null });
  });

  it('idle after stop keeps the conversation visible as ended', () => {
    let s = run(
      initialChatState,
      { type: 'start', mode: 'text', interests: [] },
      {
        type: 'frame',
        frame: { type: 'matched', pairId: 'p', mode: 'text', sharedInterests: [], initiator: true },
      },
    );
    s = run(s, { type: 'frame', frame: { type: 'idle' } });
    expect(s.status).toBe('ended');
    s = run(s, { type: 'reset' });
    expect(s.status).toBe('idle');
    expect(s.messages).toEqual([]);
  });
});
