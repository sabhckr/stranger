import { useEffect, useState } from 'react';
import { BASE, href } from './lib/base.js';

export type Route = 'home' | 'chat' | 'admin' | 'terms' | 'privacy' | 'safety' | 'not-found';

export function routeFor(pathname: string, base: string = BASE): Route {
  let path = pathname;
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length);
  switch (path.replace(/\/+$/, '') || '/') {
    case '/':
      return 'home';
    case '/chat':
      return 'chat';
    case '/admin':
      return 'admin';
    case '/terms':
      return 'terms';
    case '/privacy':
      return 'privacy';
    case '/safety':
      return 'safety';
    default:
      return 'not-found';
  }
}

const listeners = new Set<() => void>();

/** Navigate to an app route (without the base path), e.g. navigate('/chat'). */
export function navigate(path: string, replace = false): void {
  const url = href(path);
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  for (const fn of listeners) fn();
}

/** Anchors marked with `data-link` are handled client-side; everything else is a normal link. */
function onDocumentClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const anchor = (e.target as HTMLElement | null)?.closest('a[data-link]');
  if (!(anchor instanceof HTMLAnchorElement)) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  e.preventDefault();
  const path = url.pathname.startsWith(BASE)
    ? url.pathname.slice(BASE.length) || '/'
    : url.pathname;
  navigate(path);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFor(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(routeFor(window.location.pathname));
    listeners.add(update);
    window.addEventListener('popstate', update);
    document.addEventListener('click', onDocumentClick);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
      document.removeEventListener('click', onDocumentClick);
    };
  }, []);
  return route;
}
