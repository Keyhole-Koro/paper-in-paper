import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaperViewState } from '../../core/types';
import type { PaperCanvasHandle } from '../PaperCanvas';

/**
 * Callback ref that exposes a PaperCanvasHandle for hooks like useCanvasSelector.
 *
 * Use this instead of `useRef<PaperCanvasHandle>` when consumers outside the
 * canvas need to react to mount/unmount (e.g. next/dynamic delays mount).
 */
export function useCanvasHandle() {
  const [handle, setHandle] = useState<PaperCanvasHandle | null>(null);
  const handleRef = useRef<PaperCanvasHandle | null>(null);

  const setRef = useCallback((next: PaperCanvasHandle | null) => {
    handleRef.current = next;
    setHandle(next);
  }, []);

  return { ref: setRef, current: handle, mutableRef: handleRef };
}

export type CanvasHandleHook = ReturnType<typeof useCanvasHandle>;

/**
 * Subscribe to a slice of PaperCanvas state from outside the canvas.
 * Re-renders only when the selected value changes per `isEqual`.
 *
 * Pair with `useCanvasHandle` so this hook can detect canvas mount/unmount
 * (important for `dynamic({ ssr: false })`).
 */
export function useCanvasSelector<T>(
  canvas: CanvasHandleHook,
  selector: (state: PaperViewState) => T,
  fallback: T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  const [value, setValue] = useState<T>(() =>
    canvas.current ? selectorRef.current(canvas.current.getState()) : fallback,
  );

  useEffect(() => {
    const handle = canvas.current;
    if (!handle) {
      setValue(fallback);
      return;
    }

    const update = () => {
      setValue((prev) => {
        const next = selectorRef.current(handle.getState());
        return isEqualRef.current(prev, next) ? prev : next;
      });
    };
    update();
    return handle.subscribe(update);
  }, [canvas.current, fallback]);

  return value;
}
