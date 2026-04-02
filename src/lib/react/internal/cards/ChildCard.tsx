import { motion } from 'framer-motion';
import { memo, useCallback, useRef, useState } from 'react';
import type { PanInfo } from 'framer-motion';
import { useStickyDrag } from '../drag/useStickyDrag';
import type { Paper, PaperId } from '../../../core/types';
import type { DragState } from '../types';
import { getScaledRect } from '../node/paperNodeHelpers';
import { debugLog } from '../drag/debugLog';
import { findInsertTargetAtPoint } from '../drag/returnTarget';

interface Props {
  paper: Paper;
  hue: number | null;
  onClick: () => void;
  parentId: PaperId;
  depth: number;
  crumbs: PaperId[];
  dragState: DragState;
  onDragStateChange: (state: DragState) => void;
  onInsertDrop: (paperId: PaperId, parentId: PaperId, insertBeforeId: PaperId | null) => void;
}

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;
const CHILD_CARD_DRAG_SCALE = { width: 0.9, height: 0.9 } as const;

export default memo(function ChildCard({
  paper,
  hue,
  onClick,
  parentId,
  depth,
  crumbs,
  dragState,
  onDragStateChange,
  onInsertDrop,
}: Props) {
  const childCount = paper.childIds.length;
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const dragStartRectRef = useRef<DOMRect | null>(null);
  const suppressClickRef = useRef(false);
  const [isDragCompact, setIsDragCompact] = useState(false);
  const { dragControls, stickyPointerDown, cleanupStickyDrag } = useStickyDrag(true);
  const background = hue !== null ? `hsl(${hue}, 44%, 95%)` : '#f7f7fc';
  const borderColor = hue !== null ? `hsl(${hue}, 34%, 82%)` : '#e4e4ef';
  const titleColor = hue !== null ? `hsl(${hue}, 56%, 24%)` : '#111118';
  const bodyColor = hue !== null ? `hsl(${hue}, 20%, 42%)` : '#7777a0';
  const hintColor = hue !== null ? `hsl(${hue}, 24%, 52%)` : '#aaaacc';
  const shadow = hue !== null ? `0 2px 8px hsla(${hue}, 45%, 42%, 0.08)` : '0 2px 8px rgba(80, 80, 200, 0.08)';
  const previewShadow = hue !== null ? `0 10px 28px hsla(${hue}, 45%, 32%, 0.18)` : '0 10px 28px rgba(0, 0, 0, 0.16)';
  const focusColor = hue !== null ? `hsl(${hue}, 50%, 58%)` : '#8888cc';
  const badgeBackground = hue !== null ? `hsla(${hue}, 48%, 52%, 0.12)` : 'rgba(136, 136, 204, 0.12)';
  const previewBackground = hue !== null ? `hsl(${hue}, 48%, 97%)` : '#fcfcff';
  const isDragging = dragState.paperId === paper.id;

  const handleDragStart = useCallback(() => {
    const originalRect = cardRef.current?.getBoundingClientRect() ?? null;
    dragStartRectRef.current = originalRect ? getScaledRect(originalRect, CHILD_CARD_DRAG_SCALE) : null;
    setIsDragCompact(true);
    suppressClickRef.current = true;
    onDragStateChange({
      paperId: paper.id,
      parentId,
      insertTarget: null,
      point: null,
    });
    debugLog('child-drag-start', { paperId: paper.id, parentId, depth });
  }, [onDragStateChange, paper.id, parentId, depth]);

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const insertTarget = findInsertTargetAtPoint(info.point);
    onDragStateChange({
      paperId: paper.id,
      parentId,
      insertTarget,
      point: { x: info.point.x, y: info.point.y },
    });
    debugLog('child-drag-move', {
      paperId: paper.id,
      parentId,
      point: { x: info.point.x, y: info.point.y },
    });
  }, [onDragStateChange, paper.id, parentId]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const insertTarget = findInsertTargetAtPoint(info.point);
    debugLog('child-drag-end', {
      paperId: paper.id,
      parentId,
      insertTarget,
      offset: { x: info.offset.x, y: info.offset.y },
    });

    if (insertTarget) {
      onInsertDrop(paper.id, insertTarget.parentId, insertTarget.insertBeforeId);
    }

    setIsDragCompact(false);
    onDragStateChange({ paperId: null, parentId: null, insertTarget: null, point: null });
    cleanupStickyDrag();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [onInsertDrop, onDragStateChange, paper.id, parentId, cleanupStickyDrag]);

  // suppress unused warning
  void crumbs;

  return (
    <motion.button
      ref={cardRef}
      layoutId={paper.id}
      className={`child-card child-card--compact ${isDragCompact ? 'child-card--dragging' : ''}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onClick={() => {
        if (suppressClickRef.current) {
          return;
        }
        onClick();
      }}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.08}
      onPointerDown={stickyPointerDown}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      whileDrag={{ scale: 1, zIndex: isDragging ? 20 : undefined }}
      transition={{ opacity: { duration: 0.2 }, layout: lt, duration: 0.15 }}
      style={{
        borderRadius: 10,
        background,
        borderColor,
        boxShadow: shadow,
        opacity: isDragging ? 0 : undefined,
        ['--child-card-focus' as string]: focusColor,
        ['--child-card-preview-shadow' as string]: previewShadow,
        ['--child-card-preview-bg' as string]: previewBackground,
      }}
    >
      {isDragging && (
        <div
          className="child-card__drag-ghost"
          aria-hidden="true"
          style={{
            borderRadius: 10,
            background,
            borderColor,
            boxShadow: previewShadow,
          }}
        />
      )}
      <motion.div layout="position" className="child-card__row">
        <div className="child-card__title" style={{ color: titleColor }}>{paper.title}</div>
        {childCount > 0 && (
          <div className="child-card__count" style={{ color: hintColor, background: badgeBackground }}>
            {childCount}
          </div>
        )}
      </motion.div>
      <div className="child-card__preview">
        <div className="child-card__preview-title" style={{ color: titleColor }}>{paper.title}</div>
        {paper.description && <div className="child-card__body" style={{ color: bodyColor }}>{paper.description}</div>}
        <div className="child-card__hint" style={{ color: hintColor }}>
          {childCount > 0 ? `${childCount} inside →` : 'Open paper →'}
        </div>
      </div>
    </motion.button>
  );
});
