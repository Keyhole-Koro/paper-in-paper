import { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ExpansionMap, PaperId, PaperMap, PaperViewState } from '../core/types';
import { getRootId } from '../core/tree';
import { PaperStoreProvider, usePaperStore } from './context/PaperStoreContext';
import { DragProvider, type DragSession } from './context/DragContext';
import { DebugContext } from './context/DebugContext';
import { CreateChildContext, type OnCreateChild } from './context/CreateChildContext';
import { LayoutContextProvider, type NodeLayoutEntry } from './context/LayoutContext';
import type { InsertTarget } from './internal/hitTest';
import { PaperNode } from './components/PaperNode';
import { FloatingLayer } from './components/FloatingLayer';
import { useRoomSize } from './hooks/useRoomSize';
import { useDebug } from './context/DebugContext';
import { computeNodeLayout } from './hooks/usePaperLayout';
import type { LayoutRect } from './internal/roomLayout';

export interface PaperCanvasProps {
  paperMap: PaperMap;
  rootId?: PaperId;
  expansionMap?: ExpansionMap;
  focusedNodeId?: PaperId | null;
  debug?: boolean;
  onCreateChild?: OnCreateChild;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (paperId: PaperId | null) => void;
}

const HEADER_HEIGHT = 37;
const PAPER_NODE_BORDER = 2; // PaperNode has 1px border each side

function computeRecursiveLayout(
  nodeId: PaperId,
  allocatedRect: LayoutRect,
  state: PaperViewState,
): Map<PaperId, NodeLayoutEntry> {
  const roomW = Math.max(0, allocatedRect.width - PAPER_NODE_BORDER);
  const roomH = Math.max(0, allocatedRect.height - HEADER_HEIGHT - PAPER_NODE_BORDER);

  const roomLayout = computeNodeLayout(
    nodeId, roomW, roomH,
    state.paperMap, state.expansionMap, state.importanceMap, state.accessMap, state.contentHeightMap,
  );

  const result = new Map<PaperId, NodeLayoutEntry>();
  result.set(nodeId, { allocatedRect, roomLayout });

  for (const [childId, childRect] of roomLayout.childRects) {
    // Account for the border added by the motion.div wrapper inside PaperNode.tsx
    const borderLeft = 1;
    const borderTop = childRect.y > 0 ? 1 : 0;

    const childAllocated: LayoutRect = {
      id: childId,
      x: allocatedRect.x + childRect.x,
      y: allocatedRect.y + HEADER_HEIGHT + childRect.y,
      width: Math.max(0, childRect.width - borderLeft),
      height: Math.max(0, childRect.height - borderTop),
    };
    const childLayouts = computeRecursiveLayout(childId, childAllocated, state);
    for (const [id, entry] of childLayouts) {
      result.set(id, entry);
    }
  }

  return result;
}

function PaperCanvasInner({ rootId: explicitRootId }: { rootId?: PaperId }) {
  const { state, dispatch } = usePaperStore();
  const rootId = explicitRootId ?? getRootId(state.paperMap);
  const [canvasRef, canvasSize] = useRoomSize();
  const debug = useDebug();

  const layoutMap = useMemo(() => {
    if (canvasSize.width === 0 || canvasSize.height === 0) return new Map<PaperId, NodeLayoutEntry>();
    return computeRecursiveLayout(
      rootId,
      { id: rootId, x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
      state,
    );
  }, [rootId, canvasSize, state.paperMap, state.expansionMap, state.importanceMap, state.accessMap, state.contentHeightMap]);

  const copyDebugInfo = useCallback(() => {
    const lines: string[] = [`canvas: ${canvasSize.width}×${canvasSize.height}`, ''];
    for (const [id, entry] of layoutMap) {
      const { allocatedRect: a, roomLayout: r } = entry;
      lines.push(`[${id}]`);
      lines.push(`  allocated: ${a.width}×${a.height} @ (${a.x}, ${a.y})`);
      lines.push(`  content:   ${r.contentRect.width}×${r.contentRect.height} @ (${r.contentRect.x}, ${r.contentRect.y})`);
      lines.push(`  children open: ${r.childRects.size}, closed: ${r.closedChildIds.length}`);
      for (const [cid, cr] of r.childRects) {
        lines.push(`    child[${cid}]: ${cr.width}×${cr.height} @ (${cr.x}, ${cr.y})`);
      }
      lines.push('');
    }
    navigator.clipboard.writeText(lines.join('\n'));
  }, [canvasSize, layoutMap]);

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
          <PaperNode nodeId={rootId} parentId={null} />
        </div>
        <FloatingLayer />
        {debug && createPortal(
          <button
            onClick={copyDebugInfo}
            style={{
              position: 'fixed',
              bottom: 16,
              right: 16,
              zIndex: 99999,
              padding: '4px 10px',
              background: 'rgba(0,0,0,0.72)',
              color: '#0f0',
              fontFamily: 'monospace',
              fontSize: 11,
              border: '1px solid #0f0',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            copy debug
          </button>,
          document.body,
        )}
      </LayoutContextProvider>
    </DragProvider>
  );
}

export function PaperCanvas({
  paperMap,
  rootId,
  expansionMap,
  focusedNodeId,
  debug = false,
  onCreateChild,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
}: PaperCanvasProps) {
  return (
    <DebugContext.Provider value={debug}>
    <CreateChildContext.Provider value={onCreateChild ?? null}>
    <PaperStoreProvider
      paperMap={paperMap}
      expansionMap={expansionMap}
      focusedNodeId={focusedNodeId}
      onPaperMapChange={onPaperMapChange}
      onExpansionMapChange={onExpansionMapChange}
      onFocusedNodeIdChange={onFocusedNodeIdChange}
    >
      <PaperCanvasInner rootId={rootId} />
    </PaperStoreProvider>
    </CreateChildContext.Provider>
    </DebugContext.Provider>
  );
}
