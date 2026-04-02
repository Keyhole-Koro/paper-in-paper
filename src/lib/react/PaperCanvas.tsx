import { useCallback, useState } from 'react';
import type { PaperId, PaperMap } from '../core/types';
import { findRootId } from '../core/tree';
import PaperNode from './internal/node/PaperNode';
import FloatingLayer from './internal/drag/FloatingLayer';
import { LayoutProvider, useLayout } from './internal/layout/LayoutContext';
import { StoreProvider, useStore } from './internal/state/store';
import type { DragState } from './internal/types';
import { debugLog } from './internal/drag/debugLog';

interface Props {
  paperMap: PaperMap;
  rootId?: PaperId;
}

interface ContentProps {
  rootId: PaperId;
}

function PaperCanvasInner({ rootId }: ContentProps) {
  const { dispatch } = useStore();
  const { openNode } = useLayout();
  const [dragState, setDragState] = useState<DragState>({
    paperId: null,
    parentId: null,
    insertTarget: null,
    point: null,
  });

  const handleInsertDrop = useCallback((paperId: PaperId, parentId: PaperId, insertBeforeId: PaperId | null) => {
    debugLog('insert-drop-dispatch', { paperId, parentId, insertBeforeId });
    dispatch({ type: 'REORDER', parentId, childId: paperId, insertBeforeId });
    openNode(parentId, paperId);
  }, [dispatch, openNode]);

  return (
    <div className="paper-canvas">
      <div className="paper-universe">
        <PaperNode
          paperId={rootId}
          parentId={null}
          nodeState="open"
          isPrimary={true}
          depth={0}
          crumbs={[]}
          hue={null}
          dragState={dragState}
          onDragStateChange={setDragState}
          onInsertDrop={handleInsertDrop}
        />
      </div>
      <FloatingLayer dragState={dragState} />
    </div>
  );
}

function PaperCanvasContent({ rootId }: ContentProps) {
  const { state } = useStore();

  return (
    <LayoutProvider paperMap={state.paperMap}>
      <PaperCanvasInner rootId={rootId} />
    </LayoutProvider>
  );
}

export default function PaperCanvas({ paperMap, rootId }: Props) {
  const resolvedRootId = rootId ?? findRootId(paperMap);

  if (!resolvedRootId) {
    throw new Error('PaperCanvas requires a root node.');
  }

  return (
    <StoreProvider paperMap={paperMap}>
      <PaperCanvasContent rootId={resolvedRootId} />
    </StoreProvider>
  );
}
