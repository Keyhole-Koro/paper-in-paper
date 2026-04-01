import { useCallback, useRef } from 'react';
import { useDragControls } from 'framer-motion';
import type { DragControls } from 'framer-motion';

const STICKY_THRESHOLD = 8;

export function useStickyDrag(enabled: boolean): {
  dragControls: DragControls;
  stickyPointerDown: (e: React.PointerEvent) => void;
  cleanupStickyDrag: () => void;
} {
  const dragControls = useDragControls();
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  // handleMoveRef is updated every render so the closure always has fresh dragControls
  const handleMoveRef = useRef<(e: PointerEvent) => void>(() => {});

  // stableMove and stableUp are stable references (created once) for add/removeEventListener
  const stableMove = useRef((e: PointerEvent) => handleMoveRef.current(e)).current;
  const stableUp = useRef(() => {
    startPos.current = null;
    dragStarted.current = false;
    window.removeEventListener('pointermove', stableMove);
  }).current;

  handleMoveRef.current = (e: PointerEvent) => {
    if (!startPos.current || dragStarted.current) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.hypot(dx, dy) >= STICKY_THRESHOLD) {
      dragStarted.current = true;
      dragControls.start(e);
      window.removeEventListener('pointermove', stableMove);
    }
  };

  const cleanupStickyDrag = useCallback(() => {
    startPos.current = null;
    dragStarted.current = false;
    window.removeEventListener('pointermove', stableMove);
    window.removeEventListener('pointerup', stableUp);
  }, [stableMove, stableUp]);

  const stickyPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    dragStarted.current = false;
    window.addEventListener('pointermove', stableMove);
    window.addEventListener('pointerup', stableUp, { once: true });
  }, [enabled, stableMove, stableUp]);

  return { dragControls, stickyPointerDown, cleanupStickyDrag };
}
