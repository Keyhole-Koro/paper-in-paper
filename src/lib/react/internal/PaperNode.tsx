import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId, PaperMap } from '../../core/types';
import { useStore } from './store';
import type { DragState, PlacementMap } from '../PaperCanvas';
import ChildCard from './ChildCard';
import PaperHeader from './PaperHeader';
import PaperTopStrip from './PaperTopStrip';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;
const BRANCH_HUES = [210, 155, 35, 280, 10, 180, 320, 60];
const EMPTY_IDS: PaperId[] = [];

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
  onPlacementMapChange: (updater: PlacementMap | ((prev: PlacementMap) => PlacementMap)) => void;
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
  onPlacementMapChange,
}: Props) {
  const { state, dispatch } = useStore();
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [isReturnArmed, setIsReturnArmed] = useState(false);
  const returnZoneRef = useRef<HTMLDivElement | null>(null);
  const paper = state.paperMap.get(paperId)!;
  const expansion = state.expansionMap.get(paperId);
  const openChildIds = expansion?.openChildIds ?? EMPTY_IDS;
  const primaryChildId = expansion?.primaryChildId ?? null;
  const isRoot = parentId === null;
  const closedChildIds = useMemo(
    () => paper.childIds.filter((id) => !openChildIds.includes(id)),
    [paper.childIds, openChildIds],
  );
  const placement = placementMap.get(paperId);
  const draggedPosition = placement?.mode === 'floating' ? placement : { x: 0, y: 0 };

  // Stable reference for [...crumbs, paperId] — doubles as activePath for context clicks
  const childCrumbs = useMemo(() => [...crumbs, paperId], [crumbs, paperId]);

  const childHue = useCallback((childId: PaperId): number | null => {
    if (isRoot) {
      // paperId IS the rootId here, no need to scan the whole Map
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

    // childCrumbs = [...crumbs, paperId] == activePath
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
      point: { x: info.point.x, y: info.point.y },
    });
  }, [onDragStateChange, paperId, parentId]);

  const handleDragStart = useCallback(() => {
    setIsReturnArmed(false);
    onDragStateChange({
      paperId,
      parentId,
      point: null,
    });
  }, [onDragStateChange, paperId, parentId]);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const dropTargets = document.elementsFromPoint(info.point.x, info.point.y);
    const hitReturnZone = dropTargets.some((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      return (
        element.classList.contains('paper-node__return-zone') &&
        element.dataset.parentId === (parentId ?? '')
      );
    });

    if (hitReturnZone && parentId !== null) {
      onPlacementMapChange((prev) => {
        const next = new Map(prev);
        next.delete(paperId);
        return next;
      });
    } else {
      onPlacementMapChange((prev) => {
        const next = new Map(prev);
        next.set(paperId, {
          mode: 'floating',
          x: draggedPosition.x + info.offset.x,
          y: draggedPosition.y + info.offset.y,
        });
        return next;
      });
    }

    setIsReturnArmed(false);
    onDragStateChange({ paperId: null, parentId: null, point: null });
  }, [dispatch, draggedPosition.x, draggedPosition.y, onDragStateChange, onPlacementMapChange, paperId, parentId]);

  useEffect(() => {
    if (dragState.parentId !== paperId || dragState.point === null) {
      setIsReturnArmed(false);
      return;
    }

    const zone = returnZoneRef.current;
    if (!zone) {
      setIsReturnArmed(false);
      return;
    }

    const rect = zone.getBoundingClientRect();
    const { x, y } = dragState.point;
    setIsReturnArmed(x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  }, [dragState, paperId]);

  if (openChildIds.length === 1 && singleChildId !== null) {
    return (
      <motion.div
        layoutId={isRoot ? undefined : paperId}
        layout
        initial={isRoot ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={isRoot ? undefined : { opacity: 0 }}
        transition={{ opacity: { duration: 0.22 }, layout: lt }}
        className="paper-node paper-node--passthrough"
        drag={!isRoot}
        dragMomentum={false}
        dragElastic={0.08}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        whileDrag={{
          scale: 1.01,
          zIndex: 20,
        }}
        style={{
          flex: isRoot ? 1 : isPrimary ? 2 : 1,
          x: draggedPosition.x,
          y: draggedPosition.y,
        }}
      >
        {dragState.parentId === paperId && (
          <div
            ref={returnZoneRef}
            data-parent-id={paperId}
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
          paperId={singleChildId}
          parentId={paperId}
          isPrimary={true}
          depth={depth + 1}
          crumbs={childCrumbs}
          hue={childHue(singleChildId)}
          selectedContextId={selectedContextId}
          onSelectContext={onSelectContext}
          dragState={dragState}
          onDragStateChange={onDragStateChange}
          placementMap={placementMap}
          onPlacementMapChange={onPlacementMapChange}
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
      layoutId={isRoot ? undefined : paperId}
      layout
      className={[
        'paper-node',
        isRoot ? 'paper-node--root' : '',
        isPrimary ? 'paper-node--primary' : 'paper-node--secondary',
      ].join(' ')}
      initial={isRoot ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      drag={!isRoot}
      dragMomentum={false}
      dragElastic={0.08}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      whileDrag={{
        scale: 1.01,
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
        x: draggedPosition.x,
        y: draggedPosition.y,
      }}
    >
      {dragState.parentId === paperId && (
        <div
          ref={returnZoneRef}
          data-parent-id={paperId}
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
        {openChildIds.length > 0 && (
          <div className="paper-node__open-children">
            <AnimatePresence mode="popLayout" initial={false}>
              {openChildIds.map((childId) => (
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
                  onPlacementMapChange={onPlacementMapChange}
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
