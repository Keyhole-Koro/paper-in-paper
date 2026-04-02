import { AnimatePresence, motion } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PaperId } from '../../../core/types';
import { useStore } from '../state/store';
import { useLayout } from '../layout/LayoutContext';
import PaperHeader from './parts/PaperHeader';
import PaperNodeChildren from './parts/PaperNodeChildren';
import ResizeHandle from './parts/ResizeHandle';
import type { PaperNodeProps } from './utils/paperNodeTypes';
import {
  EMPTY_IDS,
  getBranchHue,
  getNodeVisualState,
} from './utils/paperNodeHelpers';
import { usePaperNodeDrag } from './hooks/usePaperNodeDrag';
import { usePaperNodeInteractions } from './hooks/usePaperNodeInteractions';
import { SIZE_SPANS } from './utils/layoutHelpers';

// ─── PASSTHROUGH NOTE ────────────────────────────────────────────────────────
// When nodeState='open' and openChildIds.length === 1, the parent could render
// in "passthrough" mode: no header, just a slim flex wrapper delegating visual
// identity to the single open child. Removed for simplicity.
// See parts/PaperPassthroughNode.tsx for the revival guide.
// ─────────────────────────────────────────────────────────────────────────────

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;

const PaperNode = memo(function PaperNode({
  paperId,
  parentId,
  nodeState,
  isPrimary,
  depth,
  crumbs,
  hue,
  gridColumnSpan,
  gridRowSpan,
  onMeasuredHeight,
  dragState,
  onDragStateChange,
  onInsertDrop,
  allowCrumbInteractions = true,
  allowHeaderInteractions = true,
}: PaperNodeProps) {
  const { state, dispatch } = useStore();
  const { getSize, onAccess, onResize } = useLayout();

  const paper = state.paperMap.get(paperId)!;
  const isRoot = parentId === null;
  const suppressClickRef = useRef(false);

  // ── Hooks (all unconditional) ─────────────────────────────────────────────
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
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
    onDragStarted: () => { suppressClickRef.current = true; },
    onDragEnded: () => { window.setTimeout(() => { suppressClickRef.current = false; }, 0); },
  });

  const { handleHeaderClick, handleCrumbClick } = usePaperNodeInteractions({
    paperId,
    parentId,
    isRoot,
    isPrimary,
    crumbs,
    dispatch,
  });

  // Open state derived data (computed unconditionally for hook consistency)
  const expansion = state.expansionMap.get(paperId);
  const openChildIds = expansion?.openChildIds ?? EMPTY_IDS;
  const primaryChildId = expansion?.primaryChildId ?? null;
  const closedChildIds = useMemo(
    () => paper.childIds.filter((id) => !openChildIds.includes(id)),
    [paper.childIds, openChildIds],
  );
  const childHue = useCallback((childId: PaperId): number | null => {
    if (isRoot) return getBranchHue(state.paperMap, childId, paperId);
    return hue;
  }, [isRoot, state.paperMap, paperId, hue]);

  // Layout size (only meaningful for open nodes, but read unconditionally)
  const size = getSize(paperId);
  const { col, row } = SIZE_SPANS[size];

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

  useEffect(() => {
    if (nodeState !== 'open' || isRoot || !onMeasuredHeight) return;

    const el = nodeElementRef.current;
    if (!el) return;

    const reportHeight = (height: number) => {
      onMeasuredHeight(paperId, height);
    };

    reportHeight(el.getBoundingClientRect().height);

    const ro = new ResizeObserver(([entry]) => {
      reportHeight(entry.contentRect.height);
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [nodeState, isRoot, onMeasuredHeight, paperId, nodeElementRef, openChildIds.length, closedChildIds.length, isHeaderHovered, paper.content]);

  // ── CLOSED STATE ──────────────────────────────────────────────────────────
  if (nodeState === 'closed') {
    const childCount = paper.childIds.length;
    const bg = hue !== null ? `hsl(${hue}, 44%, 95%)` : '#f7f7fc';
    const border = hue !== null ? `hsl(${hue}, 34%, 82%)` : '#e4e4ef';
    const titleColor = hue !== null ? `hsl(${hue}, 56%, 24%)` : '#111118';
    const bodyColor = hue !== null ? `hsl(${hue}, 20%, 42%)` : '#7777a0';
    const hintColor = hue !== null ? `hsl(${hue}, 24%, 52%)` : '#aaaacc';
    const shadow = hue !== null
      ? `0 2px 8px hsla(${hue}, 45%, 42%, 0.08)`
      : '0 2px 8px rgba(80, 80, 200, 0.08)';
    const previewShadow = hue !== null
      ? `0 10px 28px hsla(${hue}, 45%, 32%, 0.18)`
      : '0 10px 28px rgba(0, 0, 0, 0.16)';
    const focusColor = hue !== null ? `hsl(${hue}, 50%, 58%)` : '#8888cc';
    const badgeBg = hue !== null ? `hsla(${hue}, 48%, 52%, 0.12)` : 'rgba(136,136,204,0.12)';
    const previewBg = hue !== null ? `hsl(${hue}, 48%, 97%)` : '#fcfcff';
    const isDragging = dragState.paperId === paperId;

    return (
      <motion.button
        ref={nodeElementRef as React.RefObject<HTMLButtonElement>}
        layoutId={paperId}
        className={`child-card child-card--compact ${isDragCompact ? 'child-card--dragging' : ''}`}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ opacity: { duration: 0.2 }, layout: lt, duration: 0.15 }}
        onClick={() => {
          if (suppressClickRef.current) return;
          dispatch({ type: 'OPEN', parentId: parentId!, childId: paperId });
        }}
        onPointerDown={(e) => {
          onAccess(paperId);
          stickyPointerDown(e);
        }}
        drag
        dragListener={false}
        dragControls={dragControls}
        dragMomentum={false}
        dragElastic={0.08}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        whileDrag={{ scale: 1, zIndex: isDragging ? 20 : undefined }}
        style={{
          borderRadius: 10,
          background: bg,
          borderColor: border,
          boxShadow: shadow,
          opacity: isDragging ? 0 : undefined,
          ['--child-card-focus' as string]: focusColor,
          ['--child-card-preview-shadow' as string]: previewShadow,
          ['--child-card-preview-bg' as string]: previewBg,
        }}
      >
        {isDragging && (
          <div
            className="child-card__drag-ghost"
            aria-hidden="true"
            style={{ borderRadius: 10, background: bg, borderColor: border, boxShadow: previewShadow }}
          />
        )}
        <motion.div layout="position" className="child-card__row">
          <div className="child-card__title" style={{ color: titleColor }}>{paper.title}</div>
          {childCount > 0 && (
            <div className="child-card__count" style={{ color: hintColor, background: badgeBg }}>
              {childCount}
            </div>
          )}
        </motion.div>
        <div className="child-card__preview">
          <div className="child-card__preview-title" style={{ color: titleColor }}>{paper.title}</div>
          {paper.description && (
            <div className="child-card__body" style={{ color: bodyColor }}>{paper.description}</div>
          )}
          <div className="child-card__hint" style={{ color: hintColor }}>
            {childCount > 0 ? `${childCount} inside →` : 'Open paper →'}
          </div>
        </div>
      </motion.button>
    );
  }

  // ── OPEN STATE ────────────────────────────────────────────────────────────
  const isDragging = dragState.paperId === paperId;

  return (
    <motion.div
      ref={nodeElementRef as React.RefObject<HTMLDivElement>}
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
      onPointerDown={(e) => {
        onAccess(paperId);
        stickyPointerDown(e);
      }}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1, zIndex: 20 }}
      transition={{ opacity: { duration: 0.22 }, layout: lt }}
      style={{
        ...(isRoot
          ? { flex: 1 }
          : { gridColumn: `span ${gridColumnSpan ?? col}`, gridRow: `span ${gridRowSpan ?? row}` }
        ),
        background,
        border: `1px solid ${borderColor}`,
        borderRadius: isRoot ? 16 : 14,
        boxShadow: shadow,
        zIndex: nodeZIndex,
        position: 'relative',
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
        onScroll={() => onAccess(paperId)}
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
            hue={hue}
            primaryChildId={primaryChildId}
            openChildIds={openChildIds}
            closedChildIds={closedChildIds}
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
          />
      </div>
      {!isRoot && (
        <ResizeHandle
          currentSize={size}
          onResize={(s) => onResize(paperId, s)}
        />
      )}
    </motion.div>
  );
});

export default PaperNode;
