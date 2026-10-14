/**
 * Lightweight, content-neutral spam heuristics applied before relaying a message.
 * They do not inspect meaning; they stop floods, repeated pastes and link spraying.
 */
export type SpamVerdict = { ok: true; text: string } | { ok: false; reason: SpamReason };
export type SpamReason = 'too_long' | 'empty' | 'repeated' | 'links';

export interface SpamPolicy {
  maxLength: number;
  /** identical consecutive messages allowed before blocking */
  maxRepeats: number;
  /** max messages containing links within `linkWindowMs` */
  maxLinksPerWindow: number;
  linkWindowMs: number;
}

export const defaultSpamPolicy: SpamPolicy = {
  maxLength: 2000,
  maxRepeats: 2,
  maxLinksPerWindow: 3,
  linkWindowMs: 60_000,
};

const URL_RE =
  /(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+\.(?:com|net|org|io|gg|me|co|xyz|ru|cn|tk|link|app)\b/i;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g;

export class MessageSpamFilter {
  private lastNormalised = '';
  private repeats = 0;
  private linkTimes: number[] = [];

  constructor(
    private readonly policy: SpamPolicy = defaultSpamPolicy,
    private readonly now: () => number = Date.now,
  ) {}

  check(raw: string): SpamVerdict {
    const text = raw.replace(CONTROL_RE, '').replace(/\s+$/u, '');
    if (text.trim().length === 0) return { ok: false, reason: 'empty' };
    if (text.length > this.policy.maxLength) return { ok: false, reason: 'too_long' };

    const normalised = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (normalised === this.lastNormalised) {
      this.repeats += 1;
      if (this.repeats > this.policy.maxRepeats) return { ok: false, reason: 'repeated' };
    } else {
      this.lastNormalised = normalised;
      this.repeats = 0;
    }

    if (URL_RE.test(text)) {
      const t = this.now();
      this.linkTimes = this.linkTimes.filter((x) => t - x < this.policy.linkWindowMs);
      if (this.linkTimes.length >= this.policy.maxLinksPerWindow)
        return { ok: false, reason: 'links' };
      this.linkTimes.push(t);
    }
    return { ok: true, text };
  }
}
