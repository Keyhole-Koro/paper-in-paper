import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { PaperViewState } from '../../core/types';
import type { PaperCanvasHandle } from '../PaperCanvas';

/**
 * A callback ref for PaperCanvas plus the handle it receives, as state, so components outside
 * the canvas re-render when it mounts or unmounts (lazy-loaded canvases mount late):
 *
 *   const { ref, handle } = useCanvasHandle();
 *   const open = useCanvasSelector(handle, selectOpen, []);
 *   return <PaperCanvas ref={ref} ... />;
 */
export function useCanvasHandle() {
  const [handle, setHandle] = useState<PaperCanvasHandle | null>(null);
  const setRef = useCallback((next: PaperCanvasHandle | null) => {
    setHandle(next);
  }, []);

  return { ref: setRef, handle };
}

export type CanvasHandleHook = ReturnType<typeof useCanvasHandle>;

const noopSubscribe = () => () => {};

/**
 * Subscribe to a slice of PaperCanvas state from outside the canvas.
 * Re-renders only when the selected value changes per `isEqual`; returns `fallback` while no
 * canvas is mounted. Pass the `handle` from `useCanvasHandle` (or the whole hook result).
 */
export function useCanvasSelector<T>(
  canvas: PaperCanvasHandle | null | CanvasHandleHook,
  selector: (state: PaperViewState) => T,
  fallback: T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const handle = canvas === null || 'subscribe' in canvas ? canvas : canvas.handle;
  const subscribe = useMemo(
    () => (handle ? (listener: () => void) => handle.subscribe(listener) : noopSubscribe),
    [handle],
  );
  const getSelection = useMemo(() => {
    let memo: { state: PaperViewState; value: T } | null = null;
    return () => {
      if (!handle) return fallback;
      const state = handle.getState();
      if (memo !== null && memo.state === state) return memo.value;
      const value = selector(state);
      // A cache local to this getSnapshot closure (what use-sync-external-store/with-selector
      // does): it only ever holds what the last call returned, so it cannot go stale.
      // eslint-disable-next-line react-hooks/immutability
      memo = memo !== null && isEqual(memo.value, value) ? { state, value: memo.value } : { state, value };
      return memo.value;
    };
  }, [handle, selector, fallback, isEqual]);
  return useSyncExternalStore(subscribe, getSelection, getSelection);
}
