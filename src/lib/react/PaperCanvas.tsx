import { useCallback, useImperativeHandle, useMemo } from 'react';
import type { Ref } from 'react';
import type { ExpansionMap, Paper, PaperId, PaperMap } from '../core/types';
import type { PaperCanvasConfig, PaperCanvasConfigInput } from '../config/paperCanvasConfig';
import { resolvePaperCanvasConfig } from '../config/paperCanvasConfig';
import { getRootId } from '../core/tree';
import { PaperStoreProvider, usePaperDispatch, usePaperStoreSelector } from './context/PaperStoreContext';
import { DragProvider, type DragSession } from './context/DragContext';
import { DebugContext } from './context/DebugContext';
import { CreateChildContext, type OnCreateChild } from './context/CreateChildContext';
import { LayoutContextProvider } from './context/LayoutContext';
import type { InsertTarget } from './internal/hitTest';
import { PaperCanvasDebugPanel } from './components/PaperCanvasDebugPanel';
import { PaperNode } from './components/PaperNode';
import { FloatingLayer } from './components/FloatingLayer';
import { useRoomSize } from './hooks/useRoomSize';
import { useDebug } from './context/DebugContext';
import { buildCanvasDebugText, buildFocusedDebugText } from './internal/canvasDebug';
import { useCanvasLayoutSnapshot } from './hooks/useCanvasLayoutSnapshot';
import { useIndexLabels } from './hooks/useIndexLabels';
import { useOverflowAutoClose } from './hooks/useOverflowAutoClose';
import { IndexLabel } from './components/IndexLabel';

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

function PaperCanvasInner({
  rootId: explicitRootId,
  overrideCss,
  ref,
}: {
  rootId?: PaperId;
  overrideCss?: string;
  ref?: Ref<PaperCanvasHandle>;
}) {
  const { config, state } = usePaperStoreSelector(
    ({ state, config }) => ({ state, config }),
    (a, b) => a.state === b.state && a.config === b.config,
  );
  const dispatch = usePaperDispatch();

  useImperativeHandle(ref, () => ({
    upsertPapers: (papers) => dispatch({ type: 'UPSERT_PAPERS', papers }),
    mergePapers: (papers) => dispatch({ type: 'MERGE_PAPERS', papers }),
    removePaper: (id) => dispatch({ type: 'DELETE_NODE', nodeId: id }),
  }), [dispatch]);
  const rootId = explicitRootId ?? getRootId(state.paperMap);
  const [canvasRef, canvasSize] = useRoomSize();
  const debug = useDebug();
  const { layoutMap, demandSnapshot } = useCanvasLayoutSnapshot(rootId, canvasSize, state, config);
  const indexLabels = useIndexLabels(canvasSize.height, layoutMap, state, demandSnapshot, config);
  useOverflowAutoClose(layoutMap, state, config, dispatch);

  const copyDebugInfo = useCallback(() => {
    navigator.clipboard.writeText(buildCanvasDebugText(canvasSize, layoutMap, state, config, demandSnapshot));
  }, [canvasSize, layoutMap, demandSnapshot.policyMap, state, config]);
  const debugText = useMemo(
    () => buildFocusedDebugText(state.focusedNodeId, layoutMap, state, config, demandSnapshot),
    [state.focusedNodeId, layoutMap, state, config, demandSnapshot],
  );

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

  function handleIndexLabelClick(nodeId: PaperId) {
    dispatch({ type: 'UNINDEX_CONTENT', nodeId });
    dispatch({ type: 'FOCUS_NODE', nodeId });
  }

  return (
    <DragProvider onDrop={handleDrop}>
      <LayoutContextProvider layoutMap={layoutMap}>
        <div ref={canvasRef} style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}>
          <PaperNode nodeId={rootId} parentId={null} overrideCss={overrideCss} />
          {indexLabels.map((node) => (
            <IndexLabel
              key={node.id}
              node={node}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              onClick={handleIndexLabelClick}
            />
          ))}
        </div>
        <FloatingLayer />
        {debug && <PaperCanvasDebugPanel debugText={debugText} onCopy={copyDebugInfo} />}
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
