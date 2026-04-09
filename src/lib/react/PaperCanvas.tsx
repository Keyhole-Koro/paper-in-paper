import type { ExpansionMap, PaperId, PaperMap } from '../core/types';
import { getRootId } from '../core/tree';
import { PaperStoreProvider, usePaperStore } from './context/PaperStoreContext';
import { DragProvider, type DragSession } from './context/DragContext';
import { DebugContext } from './context/DebugContext';
import { CreateChildContext, type OnCreateChild } from './context/CreateChildContext';
import type { InsertTarget } from './internal/hitTest';
import { PaperNode } from './components/PaperNode';
import { FloatingLayer } from './components/FloatingLayer';

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

function PaperCanvasInner({ rootId: explicitRootId }: { rootId?: PaperId }) {
  const { state, dispatch } = usePaperStore();
  const rootId = explicitRootId ?? getRootId(state.paperMap);

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
      <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
        <PaperNode nodeId={rootId} parentId={null} />
      </div>
      <FloatingLayer />
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
