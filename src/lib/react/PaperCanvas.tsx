import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { Ref } from 'react';
import { createPortal } from 'react-dom';
import type { ExpansionMap, Paper, PaperId, PaperMap, PaperViewState } from '../core/types';
import type { PaperCanvasConfig, PaperCanvasConfigInput } from '../config/paperCanvasConfig';
import { resolvePaperCanvasConfig } from '../config/paperCanvasConfig';
import { getRootId } from '../core/tree';
import { PaperStoreProvider, usePaperStore } from './context/PaperStoreContext';
import { DragProvider, type DragSession } from './context/DragContext';
import { DebugContext } from './context/DebugContext';
import { CreateChildContext, type OnCreateChild } from './context/CreateChildContext';
import { LayoutContextProvider, type NodeLayoutEntry } from './context/LayoutContext';
import type { InsertTarget } from './internal/hitTest';
import { IndexLabel, type IndexLabelNode } from './components/IndexLabel';
import { PaperNode } from './components/PaperNode';
import { FloatingLayer } from './components/FloatingLayer';
import { useRoomSize } from './hooks/useRoomSize';
import { useDebug } from './context/DebugContext';
import { derivePaperVisibilityMode } from './internal/paperNodeView';
import { computeNodeLayout } from './hooks/usePaperLayout';
import type { LayoutRect } from '../core/layout';
import { selectLowImportanceCandidates } from '../core/candidates';

export interface PaperCanvasHandle {
  upsertPapers: (papers: Paper[]) => void;
  mergePapers: (papers: Paper[]) => void;
  removePaper: (id: PaperId) => void;
}

export interface PaperCanvasProps {
  config?: PaperCanvasConfigInput;
  paperMap: PaperMap;
  rootId?: PaperId;
  expansionMap?: ExpansionMap;
  focusedNodeId?: PaperId | null;
  isFullscreen?: boolean;
  debug?: boolean;
  overrideCss?: string;
  onCreateChild?: OnCreateChild;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (paperId: PaperId | null) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

const ZERO_RECT: LayoutRect = { id: '', x: 0, y: 0, width: 0, height: 0 };
const EMPTY_ROOM_LAYOUT = {
  contentRect: { id: '__content__', x: 0, y: 0, width: 0, height: 0 },
  childRects: new Map<PaperId, LayoutRect>(),
  closedChildIds: [] as PaperId[],
  overflowChildCount: 0,
};

function computeRecursiveLayout(
  nodeId: PaperId,
  allocatedRect: LayoutRect,
  state: PaperViewState,
  config: PaperCanvasConfig,
): Map<PaperId, NodeLayoutEntry> {
  const roomW = Math.max(0, allocatedRect.width - config.paperNode.borderWidth);
  const roomH = Math.max(0, allocatedRect.height - config.paperNode.headerHeight - config.paperNode.borderWidth);

  const roomLayout = computeNodeLayout(
    nodeId, roomW, roomH,
    state.paperMap, state.expansionMap, state.importanceMap, state.accessMap, state.contentHeightMap,
    state.indexedNodeIds,
  );

  const result = new Map<PaperId, NodeLayoutEntry>();
  result.set(nodeId, { allocatedRect, roomLayout });

  for (const [childId, childRect] of roomLayout.childRects) {
    const borderLeft = 1;
    const borderTop = childRect.y > 0 ? 1 : 0;

    const childAllocated: LayoutRect = {
      id: childId,
      x: allocatedRect.x + childRect.x,
      y: allocatedRect.y + config.paperNode.headerHeight + childRect.y,
      width: Math.max(0, childRect.width - borderLeft),
      height: Math.max(0, childRect.height - borderTop),
    };
    const childLayouts = computeRecursiveLayout(childId, childAllocated, state, config);
    for (const [id, entry] of childLayouts) {
      result.set(id, entry);
    }
  }

  // indexed nodes: open in expansionMap but excluded from layout → hidden: true
  for (const indexedId of state.indexedNodeIds) {
    if (state.expansionMap.get(nodeId)?.openChildIds.includes(indexedId)) {
      result.set(indexedId, { allocatedRect: { ...ZERO_RECT, id: indexedId }, roomLayout: EMPTY_ROOM_LAYOUT, hidden: true });
    }
  }

  return result;
}

function PaperCanvasInner({
  rootId: explicitRootId,
  overrideCss,
  ref,
}: {
  rootId?: PaperId;
  overrideCss?: string;
  ref?: Ref<PaperCanvasHandle>;
}) {
  const { config, state, dispatch } = usePaperStore();

  useImperativeHandle(ref, () => ({
    upsertPapers: (papers) => dispatch({ type: 'UPSERT_PAPERS', papers }),
    mergePapers: (papers) => dispatch({ type: 'MERGE_PAPERS', papers }),
    removePaper: (id) => dispatch({ type: 'DELETE_NODE', nodeId: id }),
  }), [dispatch]);
  const rootId = explicitRootId ?? getRootId(state.paperMap);
  const [canvasRef, canvasSize] = useRoomSize();
  const debug = useDebug();

  const layoutMap = useMemo(() => {
    if (canvasSize.width === 0 || canvasSize.height === 0) return new Map<PaperId, NodeLayoutEntry>();
    return computeRecursiveLayout(
      rootId,
      { id: rootId, x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
      state,
      config,
    );
  }, [rootId, canvasSize, state.paperMap, state.expansionMap, state.importanceMap, state.accessMap, state.contentHeightMap, config]);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const now = Date.now();
    for (const [parentId, entry] of layoutMap) {
      if (entry.roomLayout.overflowChildCount === 0) continue;
      const candidates = selectLowImportanceCandidates(stateRef.current, parentId, now);
      if (candidates.length > 0) {
        console.log(`[PaperCanvas] overflow in ${parentId}, closing candidate: ${candidates[0]}`);
      } else {
        // Space is constrained but everyone is protected
        const openIds = stateRef.current.expansionMap.get(parentId)?.openChildIds ?? [];
        const protectionInfo = openIds.map(id => {
          const until = stateRef.current.protectedUntilMap.get(id) ?? 0;
          const remaining = Math.max(0, Math.round((until - now) / 1000));
          return `${id}(${remaining}s)`;
        });
        console.log(`[PaperCanvas] overflow in ${parentId} but ALL nodes are protected:`, protectionInfo.join(', '));
      }
      if (candidates.length === 0) continue;
      dispatch({ type: 'INDEX_NODE', nodeId: candidates[0] });
    }
  }, [layoutMap, dispatch]);

  const collapsedNodes = useMemo((): IndexLabelNode[] => {
    const result: IndexLabelNode[] = [];
    for (const [id, entry] of layoutMap) {
      const paper = state.paperMap.get(id);
      if (!paper || paper.parentId === null) continue;
      const visibilityMode = derivePaperVisibilityMode({
        isRoot: paper.parentId === null,
        entry,
        config: config.paperNode,
      });
      if (visibilityMode === 'hidden') {
        const cx = entry.allocatedRect.x + entry.allocatedRect.width / 2;
        const cy = entry.allocatedRect.y + entry.allocatedRect.height / 2;
        result.push({ id, title: paper.title, side: 'left', centerX: cx, centerY: cy });
      }
    }
    return result;
  }, [layoutMap, state.paperMap, config]);

  const copyDebugInfo = useCallback(() => {
    const formatPercent = (part: number, whole: number) => {
      if (whole <= 0) return '0.0%';
      return `${((part / whole) * 100).toFixed(1)}%`;
    };

    const lines: string[] = [`canvas: ${canvasSize.width}×${canvasSize.height}`, ''];
    for (const [id, entry] of layoutMap) {
      const { allocatedRect: a, roomLayout: r } = entry;
      const roomArea = Math.max(0, a.width - config.paperNode.borderWidth) * Math.max(0, a.height - config.paperNode.headerHeight - config.paperNode.borderWidth);
      const contentArea = r.contentRect.width * r.contentRect.height;
      lines.push(`[${id}]`);
      lines.push(`  allocated: ${a.width}×${a.height} @ (${a.x}, ${a.y})`);
      lines.push(`  content:   ${r.contentRect.width}×${r.contentRect.height} @ (${r.contentRect.x}, ${r.contentRect.y}) ${formatPercent(contentArea, roomArea)}`);
      lines.push(`  children open: ${r.childRects.size}, closed: ${r.closedChildIds.length}`);
      for (const [cid, cr] of r.childRects) {
        const childArea = cr.width * cr.height;
        lines.push(`    child[${cid}]: ${cr.width}×${cr.height} @ (${cr.x}, ${cr.y}) ${formatPercent(childArea, roomArea)}`);
      }
      lines.push('');
    }
    navigator.clipboard.writeText(lines.join('\n'));
  }, [canvasSize, layoutMap]);

  const focusedDebugEntry = state.focusedNodeId ? layoutMap.get(state.focusedNodeId) : undefined;
  const focusedPaper = state.focusedNodeId ? state.paperMap.get(state.focusedNodeId) : undefined;
  const focusedRoomArea =
    focusedDebugEntry == null
      ? 0
      : Math.max(0, focusedDebugEntry.allocatedRect.width - config.paperNode.borderWidth) *
        Math.max(0, focusedDebugEntry.allocatedRect.height - config.paperNode.headerHeight - config.paperNode.borderWidth);
  const focusedContentArea =
    focusedDebugEntry == null
      ? 0
      : focusedDebugEntry.roomLayout.contentRect.width * focusedDebugEntry.roomLayout.contentRect.height;

  function handleDrop(session: DragSession, target: InsertTarget) {
    if (session.mode === 'move-parent' || session.mode === 'content-link') {
      dispatch({ type: 'MOVE_NODE', nodeId: session.draggedPaperId, targetParentId: target.parentId, insertBeforeId: target.insertBeforeId });
    } else if (session.mode === 'reorder') {
      if (session.sourceParentId === target.parentId) {
        dispatch({ type: 'REORDER_WITHIN_PARENT', parentId: target.parentId, paperId: session.draggedPaperId, position: { x: 0, y: 0 } });
      } else {
        dispatch({ type: 'MOVE_NODE', nodeId: session.draggedPaperId, targetParentId: target.parentId, insertBeforeId: target.insertBeforeId });
      }
    }
  }

  return (
    <DragProvider onDrop={handleDrop}>
      <LayoutContextProvider layoutMap={layoutMap}>
        <div ref={canvasRef} style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
          <PaperNode nodeId={rootId} parentId={null} overrideCss={overrideCss} />
          {collapsedNodes.map(n => (
            <IndexLabel
              key={n.id}
              node={n}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              onClick={(nodeId) => dispatch({ type: 'UNINDEX_NODE', nodeId })}
            />
          ))}
        </div>
        <FloatingLayer />
        {debug && createPortal(
          <div
            style={{
              position: 'fixed',
              right: 16,
              bottom: 16,
              zIndex: 99999,
              width: 320,
              maxWidth: 'calc(100vw - 32px)',
              background: 'rgba(0,0,0,0.78)',
              color: '#0f0',
              fontFamily: 'monospace',
              fontSize: 11,
              lineHeight: 1.5,
              border: '1px solid #0f0',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 10px',
                borderBottom: '1px solid rgba(0,255,0,0.25)',
              }}
            >
              <strong style={{ fontSize: 11 }}>debug</strong>
              <button
                onClick={copyDebugInfo}
                style={{
                  padding: '3px 8px',
                  background: 'transparent',
                  color: '#0f0',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  border: '1px solid rgba(0,255,0,0.5)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                copy
              </button>
            </div>
            <div style={{ padding: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {focusedDebugEntry && focusedPaper ? (
                [
                  `focused: ${state.focusedNodeId}`,
                  `title: ${focusedPaper.title}`,
                  `allocated: ${focusedDebugEntry.allocatedRect.width}×${focusedDebugEntry.allocatedRect.height} @ (${focusedDebugEntry.allocatedRect.x}, ${focusedDebugEntry.allocatedRect.y})`,
                  `content: ${focusedDebugEntry.roomLayout.contentRect.width}×${focusedDebugEntry.roomLayout.contentRect.height} @ (${focusedDebugEntry.roomLayout.contentRect.x}, ${focusedDebugEntry.roomLayout.contentRect.y}) ${focusedRoomArea > 0 ? `${((focusedContentArea / focusedRoomArea) * 100).toFixed(1)}%` : '0.0%'}`,
                  `importance: ${Math.round(state.importanceMap.get(state.focusedNodeId ?? '') ?? 0)}`,
                  `children: ${focusedDebugEntry.roomLayout.childRects.size} open / ${focusedDebugEntry.roomLayout.closedChildIds.length} closed`,
                  ...Array.from(focusedDebugEntry.roomLayout.childRects.entries()).map(([childId, rect]) => {
                    const childArea = rect.width * rect.height;
                    const pct = focusedRoomArea > 0 ? `${((childArea / focusedRoomArea) * 100).toFixed(1)}%` : '0.0%';
                    return `child[${childId}]: ${rect.width}×${rect.height} @ (${rect.x}, ${rect.y}) ${pct}`;
                  }),
                ].join('\n')
              ) : 'no focused node'}
            </div>
          </div>,
          document.body,
        )}
      </LayoutContextProvider>
    </DragProvider>
  );
}

export function PaperCanvas({
  config,
  paperMap,
  rootId,
  expansionMap,
  focusedNodeId,
  isFullscreen,
  debug = false,
  overrideCss,
  onCreateChild,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
  onFullscreenChange,
  ref,
}: PaperCanvasProps & { ref?: Ref<PaperCanvasHandle> }) {
  const resolvedConfig = useMemo(() => resolvePaperCanvasConfig(config), [config]);
  return (
    <DebugContext.Provider value={debug}>
    <CreateChildContext.Provider value={onCreateChild ?? null}>
    <PaperStoreProvider
      config={resolvedConfig}
      paperMap={paperMap}
      expansionMap={expansionMap}
      focusedNodeId={focusedNodeId}
      isFullscreen={isFullscreen}
      onPaperMapChange={onPaperMapChange}
      onExpansionMapChange={onExpansionMapChange}
      onFocusedNodeIdChange={onFocusedNodeIdChange}
      onFullscreenChange={onFullscreenChange}
    >
      <PaperCanvasInner rootId={rootId} overrideCss={overrideCss} ref={ref} />
    </PaperStoreProvider>
    </CreateChildContext.Provider>
    </DebugContext.Provider>
  );
}
