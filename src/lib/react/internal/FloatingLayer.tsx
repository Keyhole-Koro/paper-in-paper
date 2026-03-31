import { AnimatePresence, motion } from 'framer-motion';
import { useCallback } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId } from '../../core/types';
import type { DragState, FloatingPlacement, PlacementMap } from '../PaperCanvas';
import PaperNode from './PaperNode';
import { useStore } from './store';
import { findReturnParentIdAtPoint } from './returnTarget';

interface Props {
  placementMap: PlacementMap;
  dragState: DragState;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
  onDragStateChange: (state: DragState) => void;
  onPlacementMapChange: (updater: PlacementMap | ((prev: PlacementMap) => PlacementMap)) => void;
}

interface FloatingNodeProps {
  paperId: PaperId;
  placement: FloatingPlacement;
  placementMap: PlacementMap;
  dragState: DragState;
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
  selectedContextId,
  onSelectContext,
  onDragStateChange,
  onDragEnd,
}: FloatingNodeProps) {
  const handleDragStart = useCallback(() => {
    onDragStateChange({
      paperId,
      parentId: placement.parentId,
      returnParentId: null,
      dragRect: { width: placement.width, height: placement.height },
      point: null,
    });
  }, [onDragStateChange, paperId, placement.parentId]);

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    onDragStateChange({
      paperId,
      parentId: placement.parentId,
      returnParentId: findReturnParentIdAtPoint(info.point, placement.parentId),
      dragRect: { width: placement.width, height: placement.height },
      point: { x: info.point.x, y: info.point.y },
    });
  }, [onDragStateChange, paperId, placement.height, placement.parentId, placement.width]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    onDragStateChange({ paperId: null, parentId: null, returnParentId: null, dragRect: null, point: null });
    onDragEnd(paperId, info, placement);
  }, [onDragEnd, onDragStateChange, paperId, placement]);

  const isDragging = dragState.paperId === paperId;

  return (
    <motion.div
      className="paper-floating-node"
      style={{
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        zIndex: isDragging ? 100 : 10,
      }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      drag
      dragMomentum={false}
      dragElastic={0.08}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1, zIndex: 100 }}
    >
      <PaperNode
        paperId={paperId}
        parentId={placement.parentId}
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
      />
    </motion.div>
  );
}

export default function FloatingLayer({
  placementMap,
  dragState,
  selectedContextId,
  onSelectContext,
  onDragStateChange,
  onPlacementMapChange,
}: Props) {
  const { dispatch } = useStore();
  const handleDragEnd = useCallback((paperId: PaperId, info: PanInfo, placement: FloatingPlacement) => {
    const returnParentId = dragState.paperId === paperId
      ? dragState.returnParentId ?? findReturnParentIdAtPoint(info.point, placement.parentId)
      : findReturnParentIdAtPoint(info.point, placement.parentId);

    if (returnParentId === placement.parentId) {
      dispatch({
        type: 'RESTORE_FLOAT_CHILD',
        parentId: placement.parentId,
        childId: paperId,
        isPrimary: placement.isPrimary,
      });
      onPlacementMapChange((prev) => {
        const next = new Map(prev);
        next.delete(paperId);
        return next;
      });
    } else {
      onPlacementMapChange((prev) => {
        const next = new Map(prev);
        next.set(paperId, {
          ...placement,
          x: placement.x + info.offset.x,
          y: placement.y + info.offset.y,
        });
        return next;
      });
    }
  }, [dispatch, dragState.paperId, dragState.returnParentId, onPlacementMapChange]);

  return (
    <div className="paper-floating-layer">
      <AnimatePresence>
        {[...placementMap.entries()].map(([paperId, placement]) => (
          <FloatingNode
            key={paperId}
            paperId={paperId}
            placement={placement}
            placementMap={placementMap}
            dragState={dragState}
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
