import { useCallback, useEffect, useState } from 'react';
import type { CalculationSummary } from '../calculator/types.js';

export type Route =
  | { kind: 'calculator' }
  | { kind: 'history' }
  | { kind: 'calculation'; id: string }
  | { kind: 'not-found' };

export function calculationPath(calculation: Pick<CalculationSummary, 'id' | 'orderItem'>): string {
  const name = calculation.orderItem
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ł', 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
    .replace(/-$/, '');
  return `/historia/${name || 'kalkulacja'}-${calculation.id}`;
}

export function parseRoute(pathname: string): Route {
  if (pathname === '/') return { kind: 'calculator' };
  if (pathname === '/historia' || pathname === '/historia/') return { kind: 'history' };
  const match =
    /^\/historia\/[a-z0-9-]+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i.exec(
      pathname,
    );
  return match ? { kind: 'calculation', id: match[1]!.toLowerCase() } : { kind: 'not-found' };
}

export function useNavigation() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((path: string, replace = false) => {
    if (window.location.pathname === path) return;
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    setRoute(parseRoute(path));
  }, []);

  return { route, navigate };
}
