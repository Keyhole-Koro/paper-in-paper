import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import type { ExpansionMap, PaperId, PaperMap, PaperViewState } from '../core/types';
import { createInitialState, type Command, type DefaultOpenState } from '../core/commands';
import { expansionMapsEqual, isOpen, normalizeExpansionMap } from '../core/expansion';
import { canMoveNode } from '../core/tree';
import {
  paperCanvasConfigKey,
  resolvePaperCanvasConfig,
  type PaperCanvasConfigInput,
} from '../config/paperCanvasConfig';
import {
  CanvasOptionsContext,
  defaultPaperCanvasLabels,
  type CanvasCallbacks,
  type CanvasOptions,
  type LoadImageUrl,
  type OnCreateChild,
  type PaperCanvasLabels,
  type PaperMoveRequest,
} from './context/CanvasOptionsContext';
import { useCanvasOptions } from './context/CanvasOptionsContext';
import { createDragStore, type DragSession } from './drag/dragStore';
import { DragStoreContext } from './drag/dragContext';
import { usePrefersDark } from './hooks/useMediaQuery';
import type { InsertTarget } from './internal/hitTest';
import type { PaperColorScheme } from './internal/paperColors';
import { createPaperStore, type PaperStoreSnapshot } from './store/createPaperStore';
import { PaperStoreContext, usePaperStoreApi, useStoreValue } from './store/storeContext';
import { PaperCanvasDebugPanel } from './components/PaperCanvasDebugPanel';
import { PaperNode } from './components/PaperNode';
import { FloatingLayer } from './components/FloatingLayer';
import { IndexLabel } from './components/IndexLabel';

export interface PaperCanvasHandle {
  dispatch: (command: Command) => void;
  /** Applies the commands in order and notifies subscribers once. */
  dispatchAll: (commands: Command[]) => void;
  /** Opens every ancestor of the paper and focuses it. */
  revealNode: (nodeId: PaperId) => void;
  getState: () => PaperViewState;
  /** State plus what the canvas derived from it: the resolved root, the layout and index labels. */
  getSnapshot: () => PaperStoreSnapshot;
  subscribe: (listener: () => void) => () => void;
}

export interface PaperCanvasProps {
  paperMap: PaperMap;
  /** The paper to render as the root. Defaults to the first parentless paper. */
  rootId?: PaperId;
  config?: PaperCanvasConfigInput;
  /** Open state at mount. Ids of papers that have not loaded yet take effect when they arrive. */
  defaultOpenState?: DefaultOpenState;
  /** Controlled open state: whenever this prop changes, the canvas takes it over. */
  expansionMap?: ExpansionMap;
  /** Controlled focus: whenever this prop changes, the canvas takes it over. */
  focusedNodeId?: PaperId | null;
  debug?: boolean;
  /** CSS added to every HTML content frame (a paper's own `overrideCss` takes precedence). */
  overrideCss?: string;
  /** 'system' follows the reader's OS setting. Default 'light'. */
  colorScheme?: PaperColorScheme | 'system';
  /** User-facing strings; anything left out falls back to English. Pass a stable object. */
  labels?: Partial<PaperCanvasLabels>;
  /** Whether papers can be dragged to move or reorder them. Default true. */
  draggable?: boolean;
  /** Vetoes drops: return false to refuse moving `nodeId` under `targetParentId`. */
  canDrop?: (move: PaperMoveRequest) => boolean;
  onCreateChild?: OnCreateChild;
  /**
   * Turns a content image's `data-file-id` marker into a URL. Without it, marker images stay
   * blank. The host typically supplies an authenticated, short-lived signed-URL lookup.
   */
  loadImageUrl?: LoadImageUrl;
  /** Called with http(s)/mailto links clicked inside HTML content. Default: open in a new tab. */
  onOpenExternalLink?: (href: string) => void;
  /** Fires when the canvas changes the paper map (moves, creates, deletes) — not for prop updates. */
  onPaperMapChange?: (paperMap: PaperMap) => void;
  /** Fires when papers open or close. */
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  /** Fires when the focused paper changes. */
  onFocusedNodeIdChange?: (focusedNodeId: PaperId | null) => void;
}

function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a) as (keyof typeof a)[];
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => Object.is(a[key], b[key]));
}

/** `value`, or the previous value while it stays shallowly equal. */
function useShallowStable<T extends object>(value: T): T {
  const [stable, setStable] = useState(value);
  if (stable !== value && !shallowEqual(stable, value)) {
    setStable(value);
    return value;
  }
  return stable;
}

function CanvasBody() {
  const store = usePaperStoreApi();
  const rootId = useStoreValue((snapshot) => snapshot.rootId);
  const indexLabels = useStoreValue((snapshot) => snapshot.indexLabels);
  const canvasHeight = useStoreValue((snapshot) => snapshot.layout.height);
  const { debug, colorScheme } = useCanvasOptions();
  const canvasRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    store.setCanvasSize({ width: rect.width, height: rect.height });
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) store.setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [store]);

  const onLabelClick = useCallback((nodeId: PaperId) => {
    store.dispatch({ type: 'LABEL_CLICK_BOOST', nodeId });
  }, [store]);

  return (
    <>
      <div
        ref={canvasRef}
        data-paper-canvas=""
        style={{ position: 'relative', height: '100%', width: '100%', overflow: 'hidden' }}
      >
        {rootId !== null && <PaperNode nodeId={rootId} parentId={null} inheritedColor={null} />}
        {indexLabels.map((node) => (
          <IndexLabel
            key={node.id}
            node={node}
            canvasHeight={canvasHeight}
            colorScheme={colorScheme}
            onClick={onLabelClick}
          />
        ))}
      </div>
      <FloatingLayer />
      {debug && <PaperCanvasDebugPanel />}
    </>
  );
}

export function PaperCanvas({
  paperMap,
  rootId,
  config: configInput,
  defaultOpenState,
  expansionMap: expansionMapProp,
  focusedNodeId: focusedNodeIdProp,
  debug = false,
  overrideCss,
  colorScheme: colorSchemeProp = 'light',
  labels: labelsProp,
  draggable = true,
  canDrop,
  onCreateChild,
  loadImageUrl,
  onOpenExternalLink,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
  ref,
}: PaperCanvasProps & { ref?: Ref<PaperCanvasHandle> }) {
  const configKey = paperCanvasConfigKey(configInput);
  const config = useMemo(
    () => resolvePaperCanvasConfig(configKey ? (JSON.parse(configKey) as PaperCanvasConfigInput) : undefined),
    [configKey],
  );

  const [store] = useState(() => createPaperStore({
    state: createInitialState(paperMap, config, [], {
      expansionMap: expansionMapProp ?? defaultOpenState?.expansionMap,
      focusedNodeId: focusedNodeIdProp !== undefined ? focusedNodeIdProp : defaultOpenState?.focusedNodeId,
    }),
    config,
    rootId,
  }));
  const [initialState] = useState(() => store.getState());
  // The last state reported through the callbacks. A ref (not effect-local), so StrictMode's
  // effect re-run does not report the same change twice.
  const reported = useRef<PaperViewState | null>(null);

  // Latest callbacks and synced props, read at call time.
  const callbacks = useRef<CanvasCallbacks & {
    onPaperMapChange?: (paperMap: PaperMap) => void;
    onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
    onFocusedNodeIdChange?: (focusedNodeId: PaperId | null) => void;
  }>({});
  const synced = useRef({ paperMap, expansionMap: expansionMapProp, focusedNodeId: focusedNodeIdProp });

  useLayoutEffect(() => {
    callbacks.current = {
      onCreateChild,
      loadImageUrl,
      canDrop,
      onOpenExternalLink,
      onPaperMapChange,
      onExpansionMapChange,
      onFocusedNodeIdChange,
    };
  });

  const getCallbacks = useCallback(() => callbacks.current, []);

  const [dragStore] = useState(createDragStore);
  useLayoutEffect(() => {
    dragStore.setHandlers({
      getPaperMap: () => store.getState().paperMap,
      isAllowed: (session: DragSession, target: InsertTarget) => {
        const state = store.getState();
        if (target.parentId !== session.sourceParentId && !canMoveNode(state.paperMap, session.draggedPaperId, target.parentId)) {
          return false;
        }
        const veto = getCallbacks().canDrop;
        return !veto || veto({
          nodeId: session.draggedPaperId,
          sourceParentId: session.sourceParentId,
          targetParentId: target.parentId,
          insertBeforeId: target.insertBeforeId,
        }) !== false;
      },
      onDrop: (session: DragSession, target: InsertTarget) => {
        const { draggedPaperId: paperId } = session;
        if (target.parentId !== session.sourceParentId) {
          store.dispatch({ type: 'MOVE_NODE', nodeId: paperId, targetParentId: target.parentId, insertBeforeId: target.insertBeforeId });
          return;
        }
        // Same room: a reorder, which is view state only. A link dragged out of the content
        // opens the paper there.
        const commands: Command[] = [];
        if (!isOpen(store.getState().expansionMap, target.parentId, paperId)) {
          commands.push({ type: 'OPEN_NODE', parentId: target.parentId, childId: paperId });
        }
        commands.push({ type: 'REORDER_WITHIN_PARENT', parentId: target.parentId, paperId, insertBeforeId: target.insertBeforeId });
        store.dispatchAll(commands);
      },
    });
  }, [dragStore, store, getCallbacks]);

  useEffect(() => () => dragStore.dispose(), [dragStore]);
  useEffect(() => {
    if (!draggable) dragStore.cancel();
  }, [draggable, dragStore]);

  useLayoutEffect(() => {
    store.setConfig(config);
  }, [store, config]);

  useLayoutEffect(() => {
    store.setRootId(rootId);
  }, [store, rootId]);

  useLayoutEffect(() => {
    if (paperMap === synced.current.paperMap) return;
    synced.current.paperMap = paperMap;
    store.dispatch({ type: 'SET_PAPER_MAP', paperMap });
  }, [store, paperMap]);

  useLayoutEffect(() => {
    const previous = synced.current;
    const expansionChanged = expansionMapProp !== undefined && expansionMapProp !== previous.expansionMap;
    const focusChanged = focusedNodeIdProp !== undefined && focusedNodeIdProp !== previous.focusedNodeId;
    previous.expansionMap = expansionMapProp;
    previous.focusedNodeId = focusedNodeIdProp;
    if (!expansionChanged && !focusChanged) return;
    store.dispatch({
      type: 'SET_OPEN_STATE',
      expansionMap: expansionChanged ? expansionMapProp : undefined,
      focusedNodeId: focusChanged ? focusedNodeIdProp : undefined,
    });
  }, [store, expansionMapProp, focusedNodeIdProp]);

  // Report changes made inside the canvas. Values that only mirror a prop are not echoed back.
  useLayoutEffect(() => {
    const report = () => {
      const state = store.getState();
      const previous = reported.current ?? initialState;
      reported.current = state;
      const { onPaperMapChange: paperCb, onExpansionMapChange: expansionCb, onFocusedNodeIdChange: focusCb } = callbacks.current;
      const prop = synced.current;
      if (state.paperMap !== previous.paperMap && state.paperMap !== prop.paperMap) paperCb?.(state.paperMap);
      if (
        state.expansionMap !== previous.expansionMap
        && !(prop.expansionMap !== undefined && expansionMapsEqual(state.expansionMap, normalizeExpansionMap(prop.expansionMap)))
      ) {
        expansionCb?.(state.expansionMap);
      }
      if (state.focusedNodeId !== previous.focusedNodeId && state.focusedNodeId !== prop.focusedNodeId) {
        focusCb?.(state.focusedNodeId);
      }
    };
    report();
    return store.subscribe(report);
  }, [store, initialState]);

  useImperativeHandle(ref, () => ({
    dispatch: store.dispatch,
    dispatchAll: (commands) => store.dispatchAll(commands),
    revealNode: (nodeId) => store.dispatch({ type: 'REVEAL_NODE', nodeId }),
    getState: store.getState,
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,
  }), [store]);

  const prefersDark = usePrefersDark();
  const colorScheme: PaperColorScheme = colorSchemeProp === 'system'
    ? (prefersDark ? 'dark' : 'light')
    : colorSchemeProp;
  const mergedLabels = useMemo(() => ({ ...defaultPaperCanvasLabels, ...labelsProp }), [labelsProp]);
  const labels = useShallowStable(mergedLabels);
  const hasCreateChild = onCreateChild !== undefined;
  const options = useMemo<CanvasOptions>(() => ({
    debug,
    draggable,
    colorScheme,
    labels,
    overrideCss,
    hasCreateChild,
    getCallbacks,
  }), [debug, draggable, colorScheme, labels, overrideCss, hasCreateChild, getCallbacks]);

  return (
    <CanvasOptionsContext value={options}>
      <PaperStoreContext value={store}>
        <DragStoreContext value={dragStore}>
          <CanvasBody />
        </DragStoreContext>
      </PaperStoreContext>
    </CanvasOptionsContext>
  );
}
