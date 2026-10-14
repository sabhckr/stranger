export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export function wsUrl(): string {
  const configured = import.meta.env.VITE_WS_URL;
  if (configured) return configured;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}
