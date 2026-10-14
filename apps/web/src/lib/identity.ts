const CLIENT_ID_KEY = 'stranger.clientId';
const CONSENT_KEY = 'stranger.consent.v1';

export interface Consent {
  ageConfirmed: boolean;
  termsAccepted: boolean;
  at: number;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage: identity stays in memory */
  }
}

let memoryClientId: string | null = null;

/** Random per-browser id. It is never shown to other users and is HMAC-hashed by the server. */
export function getClientId(): string {
  const existing = safeGet(CLIENT_ID_KEY);
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  if (memoryClientId) return memoryClientId;
  const id = crypto.randomUUID();
  memoryClientId = id;
  safeSet(CLIENT_ID_KEY, id);
  return id;
}

export function getConsent(): Consent | null {
  const raw = safeGet(CONSENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Consent>;
    if (
      parsed.ageConfirmed === true &&
      parsed.termsAccepted === true &&
      typeof parsed.at === 'number'
    ) {
      return { ageConfirmed: true, termsAccepted: true, at: parsed.at };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function saveConsent(): Consent {
  const consent: Consent = { ageConfirmed: true, termsAccepted: true, at: Date.now() };
  safeSet(CONSENT_KEY, JSON.stringify(consent));
  return consent;
}

export function clearConsent(): void {
  try {
    window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore */
  }
}
