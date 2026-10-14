export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export function wsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

/**
 * True on a static-only deployment (e.g. GitHub Pages) with no chat server configured: the site is
 * served from github.io and neither VITE_WS_URL nor VITE_API_BASE points at a backend.
 */
export function backendMissing(): boolean {
  if (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_BASE) return false;
  return /\.github\.io$/i.test(window.location.hostname);
}

/** Nudge a sleeping free-tier backend awake as soon as the page loads (fire and forget). */
export function warmBackend(): void {
  if (!API_BASE) return;
  try {
    void fetch(`${API_BASE}/healthz`, { mode: 'cors', cache: 'no-store' }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
