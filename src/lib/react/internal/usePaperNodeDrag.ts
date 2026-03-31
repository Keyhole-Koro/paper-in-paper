import { useCallback, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId } from '../../core/types';
import type { DragState, FloatMeta } from '../PaperCanvas';
import { findReturnParentIdAtPoint } from './returnTarget';
import { getDragSizeStyle, getScaledRect } from './paperNodeHelpers';

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
  isReturnArmed: boolean;
  isDragCompact: boolean;
  dragSizeStyle: CSSProperties | null;
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

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    onDragStateChange({
      paperId,
      parentId,
      returnParentId: findReturnParentIdAtPoint(info.point, parentId),
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
      returnParentId: null,
      point: null,
    });
  }, [onDragStateChange, paperId, parentId]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const returnParentId = dragState.paperId === paperId
      ? dragState.returnParentId ?? findReturnParentIdAtPoint(info.point, parentId)
      : findReturnParentIdAtPoint(info.point, parentId);
    const dragDistance = Math.hypot(info.offset.x, info.offset.y);

    if (returnParentId !== parentId && parentId !== null && onRequestFloat && dragDistance >= FLOAT_DRAG_THRESHOLD) {
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
    onDragStateChange({ paperId: null, parentId: null, returnParentId: null, point: null });
  }, [dragState.paperId, dragState.returnParentId, paperId, parentId, depth, crumbs, hue, isPrimary, onRequestFloat, onDragStateChange]);

  return {
    nodeElementRef,
    isReturnArmed: dragState.parentId === paperId && dragState.returnParentId === paperId,
    isDragCompact,
    dragSizeStyle: getDragSizeStyle(dragState.paperId === paperId ? dragRect : null),
    handleDragStart,
    handleDrag,
    handleDragEnd,
  };
}
