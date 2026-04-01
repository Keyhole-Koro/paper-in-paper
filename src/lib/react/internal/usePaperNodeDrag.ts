import { useCallback, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId } from '../../core/types';
import type { DragState, FloatMeta } from './internalTypes';
import { getDragSizeStyle, getScaledRect } from './paperNodeHelpers';
import { useStickyDrag } from './useStickyDrag';
import type { DragControls } from 'framer-motion';
import { debugLog } from './debugLog';

const FLOAT_DRAG_THRESHOLD = 24;
const PAPER_NODE_DRAG_SCALE = { width: 0.9, height: 0.92 } as const;

interface Params {
  paperId: PaperId;
  parentId: PaperId | null;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  isPrimary: boolean;
  dragState: DragState;
  onDragStateChange: (state: DragState) => void;
  onRequestFloat?: (paperId: PaperId, info: PanInfo, meta: FloatMeta) => void;
}

interface Result {
  nodeElementRef: React.RefObject<HTMLDivElement | null>;
  isDragCompact: boolean;
  dragSizeStyle: CSSProperties | null;
  dragControls: DragControls;
  stickyPointerDown: (e: React.PointerEvent) => void;
  handleDragStart: () => void;
  handleDrag: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  handleDragEnd: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
}

export function usePaperNodeDrag({
  paperId,
  parentId,
  depth,
  crumbs,
  hue,
  isPrimary,
  dragState,
  onDragStateChange,
  onRequestFloat,
}: Params): Result {
  const nodeElementRef = useRef<HTMLDivElement | null>(null);
  const dragStartRectRef = useRef<DOMRect | null>(null);
  const [dragRect, setDragRect] = useState<{ width: number; height: number } | null>(null);
  const [isDragCompact, setIsDragCompact] = useState(false);
  const isDraggable = parentId !== null && !!onRequestFloat;
  const { dragControls, stickyPointerDown, cleanupStickyDrag } = useStickyDrag(isDraggable);

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    onDragStateChange({
      paperId,
      parentId,
      insertTarget: null,
      point: { x: info.point.x, y: info.point.y },
    });
    debugLog('dock-drag-move', {
      paperId,
      parentId,
      point: { x: info.point.x, y: info.point.y },
    });
  }, [onDragStateChange, paperId, parentId]);

  const handleDragStart = useCallback(() => {
    const originalRect = nodeElementRef.current?.getBoundingClientRect() ?? null;
    dragStartRectRef.current = originalRect ? getScaledRect(originalRect, PAPER_NODE_DRAG_SCALE) : null;
    setIsDragCompact(true);
    setDragRect(dragStartRectRef.current
      ? { width: dragStartRectRef.current.width, height: dragStartRectRef.current.height }
      : null);
    onDragStateChange({
      paperId,
      parentId,
      insertTarget: null,
      point: null,
    });
    debugLog('dock-drag-start', { paperId, parentId, depth, isPrimary });
  }, [depth, isPrimary, onDragStateChange, paperId, parentId]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const dragDistance = Math.hypot(info.offset.x, info.offset.y);
    const shouldFloat = parentId !== null && !!onRequestFloat && dragDistance >= FLOAT_DRAG_THRESHOLD;

    debugLog('dock-drag-end', {
      paperId,
      parentId,
      dragDistance,
      shouldFloat,
      offset: { x: info.offset.x, y: info.offset.y },
    });

    if (shouldFloat) {
      onRequestFloat(paperId, info, {
        parentId,
        depth,
        crumbs,
        hue,
        isPrimary,
        nodeStartRect: dragStartRectRef.current,
      });
    }

    setIsDragCompact(false);
    setDragRect(null);
    onDragStateChange({ paperId: null, parentId: null, insertTarget: null, point: null });
    cleanupStickyDrag();
  }, [paperId, parentId, depth, crumbs, hue, isPrimary, onRequestFloat, onDragStateChange, cleanupStickyDrag]);

  return {
    nodeElementRef,
    isDragCompact,
    dragSizeStyle: getDragSizeStyle(dragState.paperId === paperId ? dragRect : null),
    dragControls,
    stickyPointerDown,
    handleDragStart,
    handleDrag,
    handleDragEnd,
  };
}
