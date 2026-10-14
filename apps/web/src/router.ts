import { useEffect, useState } from 'react';

export type Route = 'home' | 'chat' | 'admin' | 'terms' | 'privacy' | 'safety' | 'not-found';

export function routeFor(pathname: string): Route {
  switch (pathname.replace(/\/+$/, '') || '/') {
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

export function navigate(path: string, replace = false): void {
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  for (const fn of listeners) fn();
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => routeFor(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(routeFor(window.location.pathname));
    listeners.add(update);
    window.addEventListener('popstate', update);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return route;
}
