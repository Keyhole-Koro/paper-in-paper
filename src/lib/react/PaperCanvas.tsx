import { useCallback, useState, type CSSProperties } from 'react';
import type { PaperId, PaperMap } from '../core/types';
import { findRootId } from '../core/tree';
import PaperNode from './internal/node/PaperNode';
import FloatingLayer from './internal/drag/FloatingLayer';
import { LayoutProvider, useLayout } from './internal/layout/LayoutContext';
import { StoreProvider, useStore } from './internal/state/store';
import type { DragState } from './internal/types';
import { debugLog } from './internal/drag/debugLog';
import type { LayoutOptionsInput } from './internal/node/utils/layoutHelpers';

export interface RootCanvasStyle {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  minWidth?: CSSProperties['minWidth'];
  minHeight?: CSSProperties['minHeight'];
  maxWidth?: CSSProperties['maxWidth'];
  maxHeight?: CSSProperties['maxHeight'];
}

const DEFAULT_ROOT_CANVAS_STYLE: RootCanvasStyle = {
  width: 1440,
  height: 960,
};

interface Props {
  paperMap: PaperMap;
  rootId?: PaperId;
  layoutOptions?: LayoutOptionsInput;
  rootCanvasStyle?: RootCanvasStyle;
}

interface ContentProps {
  rootId: PaperId;
  layoutOptions?: LayoutOptionsInput;
  rootCanvasStyle: RootCanvasStyle;
}

function PaperCanvasInner({ rootId, rootCanvasStyle }: ContentProps) {
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
        <div className="paper-root-frame" style={rootCanvasStyle}>
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
      </div>
      <FloatingLayer dragState={dragState} />
    </div>
  );
}

function PaperCanvasContent({ rootId, layoutOptions, rootCanvasStyle }: ContentProps) {
  const { state } = useStore();

  return (
    <LayoutProvider paperMap={state.paperMap} options={layoutOptions}>
      <PaperCanvasInner rootId={rootId} rootCanvasStyle={rootCanvasStyle} />
    </LayoutProvider>
  );
}

export default function PaperCanvas({ paperMap, rootId, layoutOptions, rootCanvasStyle }: Props) {
  const resolvedRootId = rootId ?? findRootId(paperMap);
  const mergedRootCanvasStyle = { ...DEFAULT_ROOT_CANVAS_STYLE, ...rootCanvasStyle };

  if (!resolvedRootId) {
    throw new Error('PaperCanvas requires a root node.');
  }

  return (
    <StoreProvider paperMap={paperMap}>
      <PaperCanvasContent
        rootId={resolvedRootId}
        layoutOptions={layoutOptions}
        rootCanvasStyle={mergedRootCanvasStyle}
      />
    </StoreProvider>
  );
}
