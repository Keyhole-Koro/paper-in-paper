import { useCallback, useImperativeHandle, useMemo } from 'react';
import type { Ref } from 'react';
import type { ExpansionMap, PaperId, PaperMap, PaperViewState } from '../core/types';
import type { Command, DefaultOpenState } from '../core/commands';
import type { PaperCanvasConfigInput } from '../config/paperCanvasConfig';
import { resolvePaperCanvasConfig } from '../config/paperCanvasConfig';
import { getRootId } from '../core/tree';
import { PaperStoreProvider, usePaperDispatch, usePaperStoreApi, usePaperStoreSelector } from './context/PaperStoreContext';
import { DragProvider, type DragSession } from './context/DragContext';
import { DebugContext } from './context/DebugContext';
import { CreateChildContext, type OnCreateChild } from './context/CreateChildContext';
import { LoadImageUrlContext, type LoadImageUrl } from './context/LoadImageUrlContext';
import { LayoutContextProvider } from './context/LayoutContext';
import type { InsertTarget } from './internal/hitTest';
import { PaperCanvasDebugPanel } from './components/PaperCanvasDebugPanel';
import { PaperNode } from './components/PaperNode';
import { FloatingLayer } from './components/FloatingLayer';
import { IndexLabel } from './components/IndexLabel';
import { useRoomSize } from './hooks/useRoomSize';
import { useDebug } from './context/DebugContext';
import { buildCanvasDebugText, buildFocusedDebugText } from './internal/canvasDebug';
import { useCanvasLayoutSnapshot } from './hooks/useCanvasLayoutSnapshot';
import { useIndexLabels } from './hooks/useIndexLabels';
import { useOverflowAutoClose } from './hooks/useOverflowAutoClose';

export interface PaperCanvasHandle {
  dispatch: (command: Command) => void;
  dispatchAll: (commands: Command[]) => void;
  revealNode: (nodeId: PaperId) => void;
  getState: () => PaperViewState;
  subscribe: (listener: () => void) => () => void;
}

export interface PaperCanvasProps {
  config?: PaperCanvasConfigInput;
  paperMap: PaperMap;
  rootId?: PaperId;
  defaultOpenState?: DefaultOpenState;
  isFullscreen?: boolean;
  debug?: boolean;
  overrideCss?: string;
  onCreateChild?: OnCreateChild;
  // loadImageUrl turns a content image's data-file-id marker into a URL.
  // Without it, marker images stay blank. The host typically supplies an
  // authenticated, short-lived signed-URL lookup.
  loadImageUrl?: LoadImageUrl;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (focusedNodeId: PaperId | null) => void;
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
  const store = usePaperStoreApi();
  const dispatch = usePaperDispatch();

  useImperativeHandle(ref, () => ({
    dispatch,
    dispatchAll: (commands) => {
      for (const command of commands) dispatch(command);
    },
    revealNode: (nodeId) => {
      const snapshot = store.getSnapshot().state;
      const target = snapshot.paperMap.get(nodeId);
      if (!target) return;

      const path: { parentId: PaperId; childId: PaperId }[] = [];
      let current = target;
      const visited = new Set<PaperId>();
      while (current.parentId !== null) {
        if (visited.has(current.id)) return;
        visited.add(current.id);
        path.push({ parentId: current.parentId, childId: current.id });
        const parent = snapshot.paperMap.get(current.parentId);
        if (!parent) return;
        current = parent;
      }

      for (const edge of path.reverse()) {
        dispatch({ type: 'OPEN_NODE', parentId: edge.parentId, childId: edge.childId });
      }
      dispatch({ type: 'FOCUS_NODE', nodeId });
    },
    getState: () => store.getSnapshot().state,
    subscribe: (listener) => store.subscribe(listener),
  }), [dispatch, store]);
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
  config: configInput,
  paperMap,
  rootId,
  defaultOpenState,
  isFullscreen,
  debug = false,
  overrideCss,
  onCreateChild,
  loadImageUrl,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
  onFullscreenChange,
  ref,
}: PaperCanvasProps & { ref?: Ref<PaperCanvasHandle> }) {
  const config = useMemo(() => resolvePaperCanvasConfig(configInput), [configInput]);

  return (
    <DebugContext.Provider value={debug}>
    <CreateChildContext.Provider value={onCreateChild ?? null}>
    <LoadImageUrlContext.Provider value={loadImageUrl ?? null}>
    <PaperStoreProvider
      config={config}
      paperMap={paperMap}
      defaultOpenState={defaultOpenState}
      isFullscreen={isFullscreen}
      onPaperMapChange={onPaperMapChange}
      onExpansionMapChange={onExpansionMapChange}
      onFocusedNodeIdChange={onFocusedNodeIdChange}
      onFullscreenChange={onFullscreenChange}
    >
      <PaperCanvasInner rootId={rootId} overrideCss={overrideCss} ref={ref} />
    </PaperStoreProvider>
    </LoadImageUrlContext.Provider>
    </CreateChildContext.Provider>
    </DebugContext.Provider>
  );
}
