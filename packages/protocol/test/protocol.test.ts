import { describe, expect, it } from 'vitest';
import {
  normaliseInterests,
  parseClientMessage,
  parseServerMessage,
  MAX_MESSAGE_LENGTH,
  PROTOCOL_VERSION,
} from '../src/index.js';

describe('protocol', () => {
  it('accepts a valid hello', () => {
    const r = parseClientMessage({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      clientId: '7a6d8a2e-0d5c-4b1a-9a4e-1f3d0b2c9e11',
      ageConfirmed: true,
      termsAccepted: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown types and oversized messages', () => {
    expect(parseClientMessage({ type: 'nope' }).success).toBe(false);
    expect(
      parseClientMessage({ type: 'message', text: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }).success,
    ).toBe(false);
    expect(parseClientMessage({ type: 'message', text: '' }).success).toBe(false);
  });

  it('normalises interests on parse', () => {
    const r = parseClientMessage({ type: 'find', mode: 'text', interests: ['  Music ', 'FILMS'] });
    expect(r.success).toBe(true);
    if (r.success && r.data.type === 'find') expect(r.data.interests).toEqual(['music', 'films']);
  });

  it('normaliseInterests drops invalid and duplicate entries', () => {
    expect(normaliseInterests(['Music', 'music', '', '<script>', 'retro gaming'])).toEqual([
      'music',
      'retro gaming',
    ]);
  });

  it('validates server frames', () => {
    expect(parseServerMessage({ type: 'presence', onlineCount: 3 }).success).toBe(true);
    expect(parseServerMessage({ type: 'presence', onlineCount: -1 }).success).toBe(false);
    expect(
      parseServerMessage({
        type: 'signal',
        data: { kind: 'description', description: { type: 'offer', sdp: 'v=0' } },
      }).success,
    ).toBe(true);
  });
});
