import { useCallback, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId } from '../../../core/types';
import type { DragState } from '../types';
import { getDragSizeStyle, getScaledRect } from './paperNodeHelpers';
import { useStickyDrag } from '../drag/useStickyDrag';
import type { DragControls } from 'framer-motion';
import { debugLog } from '../drag/debugLog';
import { findInsertTargetAtPoint } from '../drag/returnTarget';

const PAPER_NODE_DRAG_SCALE = { width: 0.9, height: 0.92 } as const;

interface Params {
  paperId: PaperId;
  parentId: PaperId | null;
  dragState: DragState;
  onDragStateChange: (state: DragState) => void;
  onInsertDrop: (paperId: PaperId, parentId: PaperId, insertBeforeId: PaperId | null) => void;
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
  dragState,
  onDragStateChange,
  onInsertDrop,
}: Params): Result {
  const nodeElementRef = useRef<HTMLDivElement | null>(null);
  const dragStartRectRef = useRef<DOMRect | null>(null);
  const [dragRect, setDragRect] = useState<{ width: number; height: number } | null>(null);
  const [isDragCompact, setIsDragCompact] = useState(false);
  const isDraggable = parentId !== null;
  const { dragControls, stickyPointerDown, cleanupStickyDrag } = useStickyDrag(isDraggable);

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const insertTarget = findInsertTargetAtPoint(info.point);
    onDragStateChange({
      paperId,
      parentId,
      insertTarget,
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
    debugLog('dock-drag-start', { paperId, parentId });
  }, [onDragStateChange, paperId, parentId]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const insertTarget = findInsertTargetAtPoint(info.point);
    debugLog('dock-drag-end', {
      paperId,
      parentId,
      insertTarget,
      offset: { x: info.offset.x, y: info.offset.y },
    });

    if (insertTarget && parentId !== null) {
      onInsertDrop(paperId, insertTarget.parentId, insertTarget.insertBeforeId);
    }

    setIsDragCompact(false);
    setDragRect(null);
    onDragStateChange({ paperId: null, parentId: null, insertTarget: null, point: null });
    cleanupStickyDrag();
  }, [paperId, parentId, onInsertDrop, onDragStateChange, cleanupStickyDrag]);

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
