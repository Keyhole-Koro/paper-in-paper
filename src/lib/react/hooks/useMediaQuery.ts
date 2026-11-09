import { useCallback, useSyncExternalStore } from 'react';

const queries = new Map<string, MediaQueryList | null>();

function mediaQuery(query: string): MediaQueryList | null {
  if (!queries.has(query)) {
    queries.set(query, typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query)
      : null);
  }
  return queries.get(query) ?? null;
}

/** Whether a media query matches, kept current as it changes. False where matchMedia is missing. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = mediaQuery(query);
    if (!list || typeof list.addEventListener !== 'function') return () => {};
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  const getSnapshot = useCallback(() => mediaQuery(query)?.matches === true, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

export function usePrefersDark(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}
