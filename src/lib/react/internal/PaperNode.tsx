import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId, PaperMap } from '../../core/types';
import { useStore } from './store';
import type { DragState, FloatMeta, PlacementMap } from '../PaperCanvas';
import ChildCard from './ChildCard';
import PaperHeader from './PaperHeader';
import PaperTopStrip from './PaperTopStrip';
import { findReturnParentIdAtPoint } from './returnTarget';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;
const BRANCH_HUES = [210, 155, 35, 280, 10, 180, 320, 60];
const EMPTY_IDS: PaperId[] = [];
const FLOAT_DRAG_THRESHOLD = 24;

// rootId is passed directly to avoid scanning the whole Map on every call
function getBranchHue(paperMap: PaperMap, paperId: PaperId, rootId: PaperId): number | null {
  const root = paperMap.get(rootId);
  if (!root) return null;

  const directChildIndex = root.childIds.indexOf(paperId);
  if (directChildIndex !== -1) {
    return BRANCH_HUES[directChildIndex % BRANCH_HUES.length];
  }

  let current = paperMap.get(paperId)?.parentId ?? null;
  while (current !== null) {
    const branchIndex = root.childIds.indexOf(current);
    if (branchIndex !== -1) {
      return BRANCH_HUES[branchIndex % BRANCH_HUES.length];
    }
    current = paperMap.get(current)?.parentId ?? null;
  }

  return null;
}


interface Props {
  paperId: PaperId;
  parentId: PaperId | null;
  isPrimary: boolean;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
  dragState: DragState;
  onDragStateChange: (state: DragState) => void;
  placementMap: PlacementMap;
  onRequestFloat?: (paperId: PaperId, info: PanInfo, meta: FloatMeta) => void;
  allowCrumbInteractions?: boolean;
}

const PaperNode = memo(function PaperNode({
  paperId,
  parentId,
  isPrimary,
  depth,
  crumbs,
  hue,
  selectedContextId,
  onSelectContext,
  dragState,
  onDragStateChange,
  placementMap,
  onRequestFloat,
  allowCrumbInteractions = true,
}: Props) {
  const { state, dispatch } = useStore();
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const nodeElementRef = useRef<HTMLDivElement | null>(null);
  const dragStartRectRef = useRef<DOMRect | null>(null);
  const paper = state.paperMap.get(paperId)!;
  const expansion = state.expansionMap.get(paperId);
  const openChildIds = expansion?.openChildIds ?? EMPTY_IDS;
  const primaryChildId = expansion?.primaryChildId ?? null;
  const isRoot = parentId === null;
  const closedChildIds = useMemo(
    () => paper.childIds.filter((id) => !openChildIds.includes(id)),
    [paper.childIds, openChildIds],
  );

  // Stable reference for [...crumbs, paperId] — doubles as activePath for context clicks
  const childCrumbs = useMemo(() => [...crumbs, paperId], [crumbs, paperId]);

  const childHue = useCallback((childId: PaperId): number | null => {
    if (isRoot) {
      return getBranchHue(state.paperMap, childId, paperId);
    }
    return hue;
  }, [isRoot, state.paperMap, paperId, hue]);

  // Passthrough-specific values — computed unconditionally to satisfy Rules of Hooks
  const singleChildId = openChildIds.length === 1 ? openChildIds[0] : null;
  const passthroughContextPathIds = useMemo(
    () => singleChildId !== null ? [...childCrumbs, singleChildId] : childCrumbs,
    [childCrumbs, singleChildId],
  );
  const shouldShowTopStrip = isRoot || selectedContextId === paperId;

  const handleHeaderClick = useCallback(() => {
    if (isRoot) return;
    if (isPrimary) {
      dispatch({ type: 'CLOSE', paperId, parentId: parentId! });
      return;
    }
    dispatch({ type: 'SET_PRIMARY', parentId: parentId!, childId: paperId });
  }, [isRoot, isPrimary, dispatch, paperId, parentId]);

  const handleCrumbClick = useCallback((idx: number) => {
    const toClose = idx + 1 < crumbs.length ? crumbs[idx + 1] : paperId;
    const fromParent = crumbs[idx];
    dispatch({ type: 'CLOSE', paperId: toClose, parentId: fromParent });
  }, [crumbs, paperId, dispatch]);

  const handleContextChildClick = useCallback((contextId: PaperId, childId: PaperId) => {
    if (contextId === paperId) {
      dispatch({ type: 'OPEN', parentId: paperId, childId });
      return;
    }

    const contextIndex = childCrumbs.indexOf(contextId);
    const activeChildId = contextIndex === -1 ? null : childCrumbs[contextIndex + 1] ?? null;

    if (activeChildId === childId) {
      dispatch({ type: 'SET_PRIMARY', parentId: contextId, childId });
      return;
    }

    dispatch({ type: 'OPEN', parentId: contextId, childId });
  }, [paperId, dispatch, childCrumbs]);

  const onContextChildClick = useCallback(
    (childId: PaperId) => handleContextChildClick(paperId, childId),
    [handleContextChildClick, paperId],
  );

  const handleHeaderMouseLeave = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientY >= bounds.bottom - 1) {
      onSelectContext(null);
    }
  }, [onSelectContext]);

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    onDragStateChange({
      paperId,
      parentId,
      returnParentId: findReturnParentIdAtPoint(info.point, parentId),
      dragRect: dragStartRectRef.current
        ? { width: dragStartRectRef.current.width, height: dragStartRectRef.current.height }
        : null,
      point: { x: info.point.x, y: info.point.y },
    });
  }, [onDragStateChange, paperId, parentId]);

  const handleDragStart = useCallback(() => {
    dragStartRectRef.current = nodeElementRef.current?.getBoundingClientRect() ?? null;
    onDragStateChange({
      paperId,
      parentId,
      returnParentId: null,
      dragRect: dragStartRectRef.current
        ? { width: dragStartRectRef.current.width, height: dragStartRectRef.current.height }
        : null,
      point: null,
    });
  }, [onDragStateChange, paperId, parentId]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const returnParentId = dragState.paperId === paperId
      ? dragState.returnParentId ?? findReturnParentIdAtPoint(info.point, parentId)
      : findReturnParentIdAtPoint(info.point, parentId);
    const dragDistance = Math.hypot(info.offset.x, info.offset.y);

    // Dropping over the rendered parent keeps the node docked instead of promoting it to floating.
    if (returnParentId !== parentId && parentId !== null && onRequestFloat && dragDistance >= FLOAT_DRAG_THRESHOLD) {
      onRequestFloat(paperId, info, { parentId, depth, crumbs, hue, isPrimary, nodeStartRect: dragStartRectRef.current });
    }

    onDragStateChange({ paperId: null, parentId: null, returnParentId: null, dragRect: null, point: null });
  }, [dragState.paperId, dragState.returnParentId, paperId, parentId, depth, crumbs, hue, isPrimary, onRequestFloat, onDragStateChange]);

  // Keep each paperId mounted in exactly one PaperNode tree at a time.
  // Duplicate instances would share the same layoutId and can "teleport" on unrelated relayouts.
  const dockedOpenChildIds = useMemo(
    () => openChildIds.filter((id) => !placementMap.has(id)),
    [openChildIds, placementMap],
  );
  const isReturnArmed = dragState.parentId === paperId && dragState.returnParentId === paperId;
  const dragSizeStyle = dragState.paperId === paperId && dragState.dragRect
    ? {
        width: dragState.dragRect.width,
        height: dragState.dragRect.height,
        flex: '0 0 auto',
      }
    : null;

  if (dockedOpenChildIds.length === 1 && !openChildIds.some((id) => placementMap.has(id))) {
    const singleDockedChildId = dockedOpenChildIds[0];
    return (
      <motion.div
        ref={nodeElementRef}
        layoutId={!isRoot ? paperId : undefined}
        layout
        initial={isRoot ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={isRoot ? undefined : { opacity: 0 }}
        transition={{ opacity: { duration: 0.22 }, layout: lt }}
        className="paper-node paper-node--passthrough"
        drag={!isRoot && !!onRequestFloat}
        dragMomentum={false}
        dragElastic={0.08}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        whileDrag={{
          scale: 1,
          zIndex: 20,
        }}
        style={{
          flex: isRoot ? 1 : isPrimary ? 2 : 1,
          ...(dragSizeStyle ?? {}),
        }}
      >
        {dragState.parentId === paperId && (
          <div
            data-return-parent-id={paperId}
            className={`paper-node__return-zone ${isReturnArmed ? 'paper-node__return-zone--active' : ''}`}
          >
            Drop to return to parent
          </div>
        )}
        {shouldShowTopStrip && (
          <PaperTopStrip
            paperMap={state.paperMap}
            contextId={paperId}
            currentPathIds={passthroughContextPathIds}
            getHue={childHue}
            onChildClick={onContextChildClick}
          />
        )}
        <PaperNode
          paperId={singleDockedChildId}
          parentId={paperId}
          isPrimary={true}
          depth={depth + 1}
          crumbs={childCrumbs}
          hue={childHue(singleDockedChildId)}
          selectedContextId={selectedContextId}
          onSelectContext={onSelectContext}
          dragState={dragState}
          onDragStateChange={onDragStateChange}
          placementMap={placementMap}
          onRequestFloat={onRequestFloat}
          allowCrumbInteractions={allowCrumbInteractions}
        />
      </motion.div>
    );
  }

  const background = isRoot
    ? 'transparent'
    : hue !== null
      ? isPrimary
        ? `hsl(${hue}, 55%, ${Math.max(93, 98 - depth * 1.5)}%)`
        : `hsl(${hue}, 35%, ${Math.max(87, 93 - depth * 1.5)}%)`
      : isPrimary
        ? `rgba(255,255,255,${Math.max(0.94, 1 - depth * 0.02)})`
        : `rgba(255,255,255,${Math.max(0.72, 0.82 - depth * 0.04)})`;

  const borderColor = isRoot
    ? 'transparent'
    : hue !== null
      ? `hsl(${hue}, 40%, ${isPrimary ? 78 : 82}%)`
      : isPrimary
        ? 'rgba(0,0,0,0.08)'
        : 'rgba(0,0,0,0.06)';

  const shadow = isRoot
    ? 'none'
    : isPrimary && hue !== null
      ? `0 4px 24px hsla(${hue}, 50%, 40%, ${Math.min(0.3, 0.1 + depth * 0.06)})`
      : isPrimary
        ? `0 4px 24px rgba(0,0,0,${Math.min(0.25, 0.1 + depth * 0.05)})`
        : 'none';

  const contentColor = hue !== null ? `hsl(${hue}, 20%, 32%)` : '#2b2b36';
  const shouldCollapseContent = openChildIds.length > 0;
  const shouldShowContent = isPrimary && Boolean(paper.content) && (!shouldCollapseContent || isHeaderHovered);
  const nodeZIndex = isRoot ? 1 : shouldShowTopStrip ? 3 : isPrimary ? 2 : 1;

  return (
    <motion.div
      ref={nodeElementRef}
      layoutId={!isRoot ? paperId : undefined}
      layout
      className={[
        'paper-node',
        isRoot ? 'paper-node--root' : '',
        isPrimary ? 'paper-node--primary' : 'paper-node--secondary',
      ].join(' ')}
      initial={isRoot ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      drag={!isRoot && !!onRequestFloat}
      dragMomentum={false}
      dragElastic={0.08}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      whileDrag={{
        scale: 1,
        zIndex: 20,
      }}
      transition={{ opacity: { duration: 0.22 }, layout: lt }}
      style={{
        flex: isRoot ? 1 : isPrimary ? 2 : 1,
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: isRoot ? 16 : 14,
        boxShadow: shadow,
        zIndex: nodeZIndex,
        ...(dragSizeStyle ?? {}),
      }}
    >
      {dragState.parentId === paperId && (
        <div
          data-return-parent-id={paperId}
          className={`paper-node__return-zone ${isReturnArmed ? 'paper-node__return-zone--active' : ''}`}
        >
          Drop to return to parent
        </div>
      )}
      {shouldShowTopStrip && (
        <PaperTopStrip
          paperMap={state.paperMap}
          contextId={paperId}
          currentPathIds={childCrumbs}
          getHue={childHue}
          onChildClick={onContextChildClick}
        />
      )}
      <PaperHeader
        paper={paper}
        paperMap={state.paperMap}
        paperId={paperId}
        crumbs={crumbs}
        hue={hue}
        isRoot={isRoot}
        isPrimary={isPrimary}
        isHovered={isHeaderHovered}
        selectedContextId={selectedContextId}
        onHeaderClick={handleHeaderClick}
        onCrumbClick={handleCrumbClick}
        onSelectContext={onSelectContext}
        onHoverChange={setIsHeaderHovered}
        onMouseLeaveDownward={handleHeaderMouseLeave}
        allowCrumbInteractions={allowCrumbInteractions}
      />

      <div className="paper-node__content">
        <AnimatePresence initial={false}>
          {shouldShowContent && (
            <motion.div
              key="content"
              className="paper-node__content-copy"
              style={{ color: contentColor }}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
            >
              {paper.content}
            </motion.div>
          )}
        </AnimatePresence>
        {dockedOpenChildIds.length > 0 && (
          <div className="paper-node__open-children">
            <AnimatePresence mode="popLayout" initial={false}>
              {dockedOpenChildIds.map((childId) => (
                <PaperNode
                  key={childId}
                  paperId={childId}
                  parentId={paperId}
                  isPrimary={childId === primaryChildId}
                  depth={depth + 1}
                  crumbs={EMPTY_IDS}
                  hue={childHue(childId)}
                  selectedContextId={selectedContextId}
                  onSelectContext={onSelectContext}
                  dragState={dragState}
                  onDragStateChange={onDragStateChange}
                  placementMap={placementMap}
                  onRequestFloat={onRequestFloat}
                  allowCrumbInteractions={allowCrumbInteractions}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
        {closedChildIds.length > 0 && (
          <div className="paper-node__closed-children">
            <AnimatePresence mode="popLayout" initial={false}>
              {closedChildIds.map((childId) => (
                <ChildCard
                  key={childId}
                  paper={state.paperMap.get(childId)!}
                  hue={childHue(childId)}
                  onClick={() => dispatch({ type: 'OPEN', parentId: paperId, childId })}
                />
              ))}
            </AnimatePresence>          </div>
        )}
        {paper.childIds.length === 0 && (
          <div className="paper-node__leaf" style={hue !== null ? { color: `hsl(${hue}, 30%, 60%)` } : {}}>— leaf —</div>
        )}
      </div>
    </motion.div>
  );
});

export default PaperNode;
