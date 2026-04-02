import { useCallback, useRef } from 'react';
import type { NodeSize } from '../utils/layoutHelpers';

interface Props {
  currentSize: NodeSize;
  onResize: (size: NodeSize) => void;
}

// Drag distance thresholds (px) to snap to a larger size
const COL_THRESHOLD = 80;
const ROW_THRESHOLD = 80;

export default function ResizeHandle({ currentSize, onResize }: Props) {
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();  // prevent node drag from firing
    e.currentTarget.setPointerCapture(e.pointerId);
    startPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    startPosRef.current = null;

    let next: NodeSize;
    if (dx > COL_THRESHOLD && dy > ROW_THRESHOLD) {
      next = 'lg';
    } else if (dx > COL_THRESHOLD) {
      next = 'md';
    } else {
      next = 'sm';
    }

    if (next !== currentSize) {
      onResize(next);
    }
  }, [currentSize, onResize]);

  const handlePointerCancel = useCallback(() => {
    startPosRef.current = null;
  }, []);

  return (
    <div
      className="paper-node__resize-handle"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      title="Drag to resize"
      aria-label="Resize node"
    />
  );
}
