import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useMemo, useState } from 'react';
import type { PaperId } from '../../../core/types';
import { useStore } from '../state/store';
import PaperHeader from './PaperHeader';
import type { PaperNodeProps } from './paperNodeTypes';
import { EMPTY_IDS, getBranchHue, getNodeVisualState } from './paperNodeHelpers';
import { usePaperNodeDrag } from './usePaperNodeDrag';
import { usePaperNodeInteractions } from './usePaperNodeInteractions';
import PaperPassthroughNode from './PaperPassthroughNode';
import PaperNodeChildren from './PaperNodeChildren';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;

const PaperNode = memo(function PaperNode({
  paperId,
  parentId,
  isPrimary,
  depth,
  crumbs,
  hue,
  dragState,
  onDragStateChange,
  onInsertDrop,
  allowCrumbInteractions = true,
  allowHeaderInteractions = true,
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

  const childHue = useCallback((childId: PaperId): number | null => {
    if (isRoot) {
      return getBranchHue(state.paperMap, childId, paperId);
    }
    return hue;
  }, [isRoot, state.paperMap, paperId, hue]);

  const {
    handleHeaderClick,
    handleCrumbClick,
  } = usePaperNodeInteractions({
    paperId,
    parentId,
    isRoot,
    isPrimary,
    crumbs,
    dispatch,
  });
  const {
    nodeElementRef,
    isDragCompact,
    dragSizeStyle,
    dragControls,
    stickyPointerDown,
    handleDragStart,
    handleDrag,
    handleDragEnd,
  } = usePaperNodeDrag({
    paperId,
    parentId,
    dragState,
    onDragStateChange,
    onInsertDrop,
  });

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
  });
  const isDragging = dragState.paperId === paperId;

  if (openChildIds.length === 1) {
    return (
      <PaperPassthroughNode
        paperId={paperId}
        isRoot={isRoot}
        isPrimary={isPrimary}
        singleOpenChildId={openChildIds[0]}
        paperMap={state.paperMap}
        getHue={childHue}
        NodeComponent={PaperNode}
        nodeElementRef={nodeElementRef}
        dragHandlers={{ handleDragStart, handleDrag, handleDragEnd, dragControls, stickyPointerDown }}
        isDragCompact={isDragCompact}
        dragSizeStyle={dragSizeStyle}
        dragState={dragState}
        onDragStateChange={onDragStateChange}
        onInsertDrop={onInsertDrop}
        allowCrumbInteractions={allowCrumbInteractions}
        allowHeaderInteractions={allowHeaderInteractions}
        depth={depth}
        crumbs={crumbs}
      />
    );
  }

  return (
    <motion.div
      ref={nodeElementRef}
      layoutId={!isRoot ? paperId : undefined}
      layout
      className={[
        'paper-node',
        isRoot ? 'paper-node--root' : '',
        isPrimary ? 'paper-node--primary' : 'paper-node--secondary',
        isDragCompact ? 'paper-node--dragging' : '',
      ].join(' ')}
      initial={isRoot ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      drag={!isRoot}
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.08}
      onPointerDown={stickyPointerDown}
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
      data-docked-paper-id={!isRoot ? paperId : undefined}
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
      <PaperHeader
        paper={paper}
        paperMap={state.paperMap}
        paperId={paperId}
        crumbs={crumbs}
        hue={hue}
        isRoot={isRoot}
        isPrimary={isPrimary}
        isHovered={isHeaderHovered}
        onHeaderClick={handleHeaderClick}
        onCrumbClick={handleCrumbClick}
        onHoverChange={setIsHeaderHovered}
        onMouseLeaveDownward={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientY >= bounds.bottom - 1) setIsHeaderHovered(false);
        }}
        allowCrumbInteractions={allowCrumbInteractions}
        allowHeaderInteractions={allowHeaderInteractions}
      />

      <div
        className="paper-node__content"
        data-empty-insert-parent-id={openChildIds.length === 0 ? paperId : undefined}
      >
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
          openChildIds={openChildIds}
          closedChildren={closedChildren}
          leafVisible={paper.childIds.length === 0}
          leafStyle={hue !== null ? { color: `hsl(${hue}, 30%, 60%)` } : {}}
          getHue={childHue}
          NodeComponent={PaperNode}
          dragState={dragState}
          onDragStateChange={onDragStateChange}
          onInsertDrop={onInsertDrop}
          allowCrumbInteractions={allowCrumbInteractions}
          allowHeaderInteractions={allowHeaderInteractions}
          depth={depth}
          crumbs={crumbs}
          onOpenChild={(childId) => dispatch({ type: 'OPEN', parentId: paperId, childId })}
        />
      </div>
    </motion.div>
  );
});

export default PaperNode;
