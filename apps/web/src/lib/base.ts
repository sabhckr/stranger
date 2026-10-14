/** Deployment base path ('' at the root, '/stranger' on GitHub Pages). Safe outside Vite too. */
const metaEnv = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
export const BASE: string = (metaEnv?.BASE_URL ?? '/').replace(/\/$/, '');

/** Absolute app path for a route, honouring the base path. */
export function href(path: string): string {
  return `${BASE}${path}` || '/';
}
