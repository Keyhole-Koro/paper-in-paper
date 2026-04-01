import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useMemo, useRef } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId } from '../../core/types';
import type { DragState, FloatingPlacement, PlacementMap } from './internalTypes';
import PaperNode from './PaperNode';
import { findInsertIndicatorRect, findInsertTargetAtPoint } from './returnTarget';
import { debugLog } from './debugLog';

interface Props {
  placementMap: PlacementMap;
  dragState: DragState;
  focusId: PaperId | null;
  highlightId: PaperId | null;
  onFocus: (paperId: PaperId | null) => void;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
  onDragStateChange: (state: DragState) => void;
  onPlacementMapChange: (updater: PlacementMap | ((prev: PlacementMap) => PlacementMap)) => void;
  onInsertDrop: (paperId: PaperId, parentId: PaperId, insertBeforeId: PaperId | null) => void;
}

interface FloatingNodeProps {
  paperId: PaperId;
  placement: FloatingPlacement;
  placementMap: PlacementMap;
  dragState: DragState;
  isActive: boolean;
  isHighlighted: boolean;
  onPointerDown: (paperId: PaperId) => void;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
  onDragStateChange: (state: DragState) => void;
  onDragEnd: (paperId: PaperId, info: PanInfo, placement: FloatingPlacement) => void;
}

function FloatingNode({
  paperId,
  placement,
  placementMap,
  dragState,
  isActive,
  isHighlighted,
  onPointerDown,
  selectedContextId,
  onSelectContext,
  onDragStateChange,
  onDragEnd,
}: FloatingNodeProps) {
  const handleDragStart = useCallback(() => {
    debugLog('floating-drag-start', { paperId, parentId: placement.parentId });
    onDragStateChange({
      paperId,
      parentId: placement.parentId,
      insertTarget: null,
      point: null,
    });
  }, [onDragStateChange, paperId, placement.parentId]);

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const insertTarget = findInsertTargetAtPoint(info.point);
    onDragStateChange({
      paperId,
      parentId: placement.parentId,
      insertTarget,
      point: { x: info.point.x, y: info.point.y },
    });
    debugLog('floating-drag-move', {
      paperId,
      parentId: placement.parentId,
      point: { x: info.point.x, y: info.point.y },
      insertTarget,
    });
  }, [onDragStateChange, paperId, placement.height, placement.parentId, placement.width]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    onDragStateChange({ paperId: null, parentId: null, insertTarget: null, point: null });
    onDragEnd(paperId, info, placement);
  }, [onDragEnd, onDragStateChange, paperId, placement]);

  const isDragging = dragState.paperId === paperId;
  const zIndex = isDragging ? 100 : isActive ? 50 : 10;

  return (
    <motion.div
      className="paper-floating-node"
      style={{
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        zIndex,
      }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      drag
      dragMomentum={false}
      dragElastic={0.08}
      onPointerDown={() => onPointerDown(paperId)}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1, zIndex: 100 }}
    >
      {isHighlighted && (
        <div className="paper-floating-node__highlight-ring" aria-hidden="true" />
      )}
      <PaperNode
        paperId={paperId}
        parentId={placement.parentId}
        mode="floating-duplicate"
        isPrimary={placement.isPrimary}
        depth={placement.depth}
        crumbs={placement.crumbs}
        hue={placement.hue}
        selectedContextId={selectedContextId}
        onSelectContext={onSelectContext}
        dragState={dragState}
        onDragStateChange={onDragStateChange}
        placementMap={placementMap}
        onRequestFloat={undefined}
        allowCrumbInteractions={false}
        allowHeaderInteractions={false}
        allowContextInteractions={false}
      />
    </motion.div>
  );
}

export default function FloatingLayer({
  placementMap,
  dragState,
  focusId,
  highlightId,
  onFocus,
  selectedContextId,
  onSelectContext,
  onDragStateChange,
  onPlacementMapChange,
  onInsertDrop,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const insertIndicatorStyle = useMemo(() => {
    if (dragState.paperId === null || dragState.insertTarget === null) {
      return null;
    }

    const indicatorRect = findInsertIndicatorRect(dragState.insertTarget);
    const layerRect = layerRef.current?.getBoundingClientRect();
    if (!indicatorRect || !layerRect) {
      return null;
    }

    return {
      kind: indicatorRect.kind,
      left: indicatorRect.left - layerRect.left - (indicatorRect.kind === 'gap' ? 4 : 0),
      top: indicatorRect.top - layerRect.top,
      width: indicatorRect.width,
      height: indicatorRect.height,
    };
  }, [dragState.paperId, dragState.insertTarget, dragState.point]);

  const handleDragEnd = useCallback((paperId: PaperId, info: PanInfo, placement: FloatingPlacement) => {
    const insertTarget = dragState.paperId === paperId ? dragState.insertTarget : null;
    debugLog('floating-drag-end', {
      paperId,
      placementParentId: placement.parentId,
      dragStatePaperId: dragState.paperId,
      insertTarget,
      offset: { x: info.offset.x, y: info.offset.y },
    });
    if (insertTarget) {
      debugLog('floating-drop-insert', {
        paperId,
        parentId: insertTarget.parentId,
        insertBeforeId: insertTarget.insertBeforeId,
      });
      onInsertDrop(paperId, insertTarget.parentId, insertTarget.insertBeforeId);
      onPlacementMapChange((prev) => { const next = new Map(prev); next.delete(paperId); return next; });
      return;
    }

    debugLog('floating-drop-stay-floating', {
      paperId,
      parentId: placement.parentId,
    });
    onPlacementMapChange((prev) => {
      const next = new Map(prev);
      next.set(paperId, {
        ...placement,
        x: placement.x + info.offset.x,
        y: placement.y + info.offset.y,
      });
      return next;
    });
  }, [dragState.paperId, dragState.insertTarget, onPlacementMapChange, onInsertDrop]);

  return (
    <div className="paper-floating-layer" ref={layerRef}>
      {insertIndicatorStyle && (
        <div
          className={`paper-insert-indicator paper-insert-indicator--${insertIndicatorStyle.kind}`}
          style={{
            left: insertIndicatorStyle.left,
            top: insertIndicatorStyle.top,
            width: insertIndicatorStyle.kind === 'surface' ? insertIndicatorStyle.width : undefined,
            height: insertIndicatorStyle.height,
          }}
          aria-hidden="true"
        />
      )}
      <AnimatePresence>
        {[...placementMap.entries()].map(([paperId, placement]) => (
          <FloatingNode
            key={paperId}
            paperId={paperId}
            placement={placement}
            placementMap={placementMap}
            dragState={dragState}
            isActive={focusId === paperId}
            isHighlighted={highlightId === paperId}
            onPointerDown={onFocus}
            selectedContextId={selectedContextId}
            onSelectContext={onSelectContext}
            onDragStateChange={onDragStateChange}
            onDragEnd={handleDragEnd}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
