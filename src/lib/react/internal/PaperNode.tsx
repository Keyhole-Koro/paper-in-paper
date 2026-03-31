import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useMemo, useState } from 'react';
import type { PaperId } from '../../core/types';
import { useStore } from './store';
import PaperHeader from './PaperHeader';
import PaperTopStrip from './PaperTopStrip';
import type { PaperNodeProps } from './paperNodeTypes';
import { EMPTY_IDS, getBranchHue, getDockedOpenChildIds, getNodeVisualState } from './paperNodeHelpers';
import { usePaperNodeDrag } from './usePaperNodeDrag';
import { usePaperNodeInteractions } from './usePaperNodeInteractions';
import PaperPassthroughNode from './PaperPassthroughNode';
import PaperNodeChildren from './PaperNodeChildren';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;

const PaperNode = memo(function PaperNode({
  paperId,
  parentId,
  mode = 'docked',
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
  allowHeaderInteractions = true,
  allowContextInteractions = true,
}: PaperNodeProps) {
  const { state, dispatch } = useStore();
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
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
  const {
    handleHeaderClick,
    handleCrumbClick,
    onContextChildClick,
    handleHeaderMouseLeave,
  } = usePaperNodeInteractions({
    paperId,
    parentId,
    isRoot,
    isPrimary,
    crumbs,
    childCrumbs,
    dispatch,
    onSelectContext,
  });
  const {
    nodeElementRef,
    isReturnArmed,
    dragSizeStyle,
    handleDragStart,
    handleDrag,
    handleDragEnd,
  } = usePaperNodeDrag({
    paperId,
    parentId,
    depth,
    crumbs,
    hue,
    isPrimary,
    dragState,
    onDragStateChange,
    onRequestFloat,
  });
  const dockedOpenChildIds = useMemo(
    () => getDockedOpenChildIds(openChildIds, placementMap),
    [openChildIds, placementMap],
  );
  const closedChildren = useMemo(
    () => closedChildIds.map((id) => ({
      id,
      paper: state.paperMap.get(id)!,
      hue: childHue(id),
    })),
    [closedChildIds, state.paperMap, childHue],
  );
  const {
    background,
    borderColor,
    shadow,
    contentColor,
    shouldShowContent,
    nodeZIndex,
  } = getNodeVisualState({
    isRoot,
    hue,
    isPrimary,
    depth,
    openChildIds,
    hasContent: Boolean(paper.content),
    isHeaderHovered,
    shouldShowTopStrip,
  });
  const isDragging = dragState.paperId === paperId;
  if (dockedOpenChildIds.length === 1 && !openChildIds.some((id) => placementMap.has(id))) {
    return (
      <PaperPassthroughNode
        paperId={paperId}
        mode={mode}
        isRoot={isRoot}
        isPrimary={isPrimary}
        singleDockedChildId={dockedOpenChildIds[0]}
        childCrumbs={childCrumbs}
        passthroughContextPathIds={passthroughContextPathIds}
        shouldShowTopStrip={shouldShowTopStrip}
        paperMap={state.paperMap}
        getHue={childHue}
        onContextChildClick={onContextChildClick}
        NodeComponent={PaperNode}
        nodeElementRef={nodeElementRef}
        dragHandlers={{ handleDragStart, handleDrag, handleDragEnd }}
        dragSizeStyle={dragSizeStyle}
        isReturnArmed={isReturnArmed}
        selectedContextId={selectedContextId}
        onSelectContext={onSelectContext}
        dragState={dragState}
        onDragStateChange={onDragStateChange}
        placementMap={placementMap}
        onRequestFloat={onRequestFloat}
        allowCrumbInteractions={allowCrumbInteractions}
        allowHeaderInteractions={allowHeaderInteractions}
        allowContextInteractions={allowContextInteractions}
        depth={depth}
      />
    );
  }

  return (
    <motion.div
      ref={nodeElementRef}
      layoutId={!isRoot && mode === 'docked' ? paperId : undefined}
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
      {isDragging && (
        <div
          className="paper-node__drag-ghost"
          aria-hidden="true"
          style={{
            borderRadius: isRoot ? 16 : 14,
            background,
            borderColor,
            boxShadow: shadow === 'none' ? '0 18px 36px rgba(0,0,0,0.12)' : shadow,
          }}
        />
      )}
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
          allowInteractions={allowContextInteractions}
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
        allowHeaderInteractions={allowHeaderInteractions}
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
        <PaperNodeChildren
          paperId={paperId}
          primaryChildId={primaryChildId}
          dockedOpenChildIds={dockedOpenChildIds}
          closedChildren={closedChildren}
          leafVisible={paper.childIds.length === 0}
          leafStyle={hue !== null ? { color: `hsl(${hue}, 30%, 60%)` } : {}}
          getHue={childHue}
          NodeComponent={PaperNode}
          selectedContextId={selectedContextId}
          onSelectContext={onSelectContext}
          dragState={dragState}
          onDragStateChange={onDragStateChange}
          placementMap={placementMap}
          onRequestFloat={onRequestFloat}
          allowCrumbInteractions={allowCrumbInteractions}
          allowHeaderInteractions={allowHeaderInteractions}
          allowContextInteractions={allowContextInteractions}
          depth={depth}
          crumbs={crumbs}
          onOpenChild={(childId) => dispatch({ type: 'OPEN', parentId: paperId, childId })}
        />
      </div>
    </motion.div>
  );
});

export default PaperNode;
