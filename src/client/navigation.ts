import { useEffect, useRef, useState } from 'react';
export type View = 'inventory' | 'journal' | 'backups';
export type Navigation = { view: View; serverId: string | null };
export function readNavigation(search: string): Navigation {
  const params = new URLSearchParams(search);
  const value = params.get('view');
  const view: View = value === 'journal' || value === 'backups' ? value : 'inventory';
  return {
    view,
    serverId: view === 'inventory' ? params.get('server') || null : null,
  };
}
export function navigationUrl(href: string, next: Navigation) {
  const url = new URL(href);
  url.searchParams.delete('view');
  url.searchParams.delete('server');
  if (next.view !== 'inventory') url.searchParams.set('view', next.view);
  if (next.view === 'inventory' && next.serverId) url.searchParams.set('server', next.serverId);
  return `${url.pathname}${url.search}${url.hash}`;
}
export function useNavigation() {
  const [state, setState] = useState(() => readNavigation(window.location.search));
  const previous = useRef(state);
  useEffect(() => {
    if (previous.current.view === state.view && previous.current.serverId === state.serverId)
      return;
    previous.current = state;
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [state]);
  useEffect(() => {
    const onPop = () => setState(readNavigation(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  function navigate(view: View, serverId: string | null = null) {
    const next = { view, serverId: view === 'inventory' ? serverId : null };
    const url = navigationUrl(window.location.href, next);
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`)
      window.history.pushState(null, '', url);
    setState(next);
  }
  return { ...state, navigate };
}
