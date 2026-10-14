import { createHmac, timingSafeEqual } from 'node:crypto';

/** Stable, non-reversible identifier for a browser-generated client id. */
export function hashClientId(clientId: string, secret: string): string {
  return createHmac('sha256', secret).update(`client:${clientId}`).digest('hex');
}

/** Stable IP hash, only ever stored inside ban records. */
export function hashIpStable(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(`ip:${ip}`).digest('hex');
}

/** Daily-rotating IP hash for rate limiting and connection caps (keys expire within 24 h). */
export function hashIpDaily(ip: string, secret: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return createHmac('sha256', secret).update(`ip:${day}:${ip}`).digest('hex').slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
  expiresAt: number;
}

/**
 * Time-limited TURN credentials as implemented by coturn's `use-auth-secret` / `static-auth-secret`
 * (draft-uberti-behave-turn-rest-00): username = "<unix expiry>:<label>", password = base64(HMAC-SHA1).
 */
export function mintTurnCredentials(
  secret: string,
  ttlSeconds: number,
  label = 'stranger',
  now: number = Date.now(),
): TurnCredentials {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const username = `${expiresAt}:${label}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential, ttl: ttlSeconds, expiresAt };
}

/** Extract the client IP honouring X-Forwarded-For only when the server sits behind a trusted proxy. */
export function clientIpFrom(
  headers: Record<string, string | string[] | undefined>,
  socketAddress: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const xff = headers['x-forwarded-for'];
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return socketAddress ?? '0.0.0.0';
}
