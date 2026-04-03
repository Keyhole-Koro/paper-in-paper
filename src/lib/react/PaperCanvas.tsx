import type { ExpansionMap, PaperId, PaperMap } from '../core/types';
import { getRootId } from '../core/tree';
import { PaperStoreProvider, usePaperStore } from './context/PaperStoreContext';
import { DragProvider, type DragSession } from './context/DragContext';
import type { InsertTarget } from './internal/hitTest';
import { PaperNode } from './components/PaperNode';
import { Sidebar } from './components/Sidebar';
import { FloatingLayer } from './components/FloatingLayer';
import { useImportanceTick } from './hooks/useImportanceTick';

export interface PaperCanvasProps {
  paperMap: PaperMap;
  rootId?: PaperId;
  expansionMap?: ExpansionMap;
  unplacedNodeIds?: PaperId[];
  focusedNodeId?: PaperId | null;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (paperId: PaperId | null) => void;
  onUnplacedNodeIdsChange?: (ids: PaperId[]) => void;
}

function PaperCanvasInner() {
  const { state, dispatch } = usePaperStore();
  const rootId = getRootId(state.paperMap);
  useImportanceTick();

  function handleDrop(session: DragSession, target: InsertTarget) {
    if (session.mode === 'attach-unplaced') {
      dispatch({ type: 'ATTACH_UNPLACED_NODE', nodeId: session.draggedPaperId, targetParentId: target.parentId, insertBeforeId: target.insertBeforeId });
    } else if (session.mode === 'move-parent' || session.mode === 'content-link') {
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
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
          <PaperNode nodeId={rootId} parentId={null} />
        </div>
        <Sidebar />
      </div>
      <FloatingLayer />
    </DragProvider>
  );
}

export function PaperCanvas({
  paperMap,
  unplacedNodeIds,
  expansionMap,
  focusedNodeId,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
  onUnplacedNodeIdsChange,
}: PaperCanvasProps) {
  return (
    <PaperStoreProvider
      paperMap={paperMap}
      unplacedNodeIds={unplacedNodeIds}
      expansionMap={expansionMap}
      focusedNodeId={focusedNodeId}
      onPaperMapChange={onPaperMapChange}
      onExpansionMapChange={onExpansionMapChange}
      onFocusedNodeIdChange={onFocusedNodeIdChange}
      onUnplacedNodeIdsChange={onUnplacedNodeIdsChange}
    >
      <PaperCanvasInner />
    </PaperStoreProvider>
  );
}
