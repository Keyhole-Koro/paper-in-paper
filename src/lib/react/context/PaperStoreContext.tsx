import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { ExpansionMap, PaperId, PaperMap, PaperViewState } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import { type Command, type DefaultOpenState, createInitialState, reduce } from '../../core/commands';

export interface PaperStoreProviderProps {
  config: PaperCanvasConfig;
  paperMap: PaperMap;
  defaultOpenState?: DefaultOpenState;
  isFullscreen?: boolean;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (focusedNodeId: PaperId | null) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
  children: ReactNode;
}

interface PaperStoreContextValue {
  config: PaperCanvasConfig;
  state: PaperViewState;
  isFullscreen: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

const PaperStoreContext = createContext<PaperStoreContextValue | null>(null);
const PaperDispatchContext = createContext<((command: Command) => void) | null>(null);
type PaperStoreSnapshot = { state: PaperViewState; config: PaperCanvasConfig };
type PaperStoreListener = () => void;
interface PaperStoreSelectorContextValue {
  subscribe: (listener: PaperStoreListener) => () => void;
  getSnapshot: () => PaperStoreSnapshot;
}
// Optimization layer: lets deeply recursive consumers subscribe to a small
// slice of store state instead of re-reading the whole context value.
const PaperStoreSelectorContext = createContext<PaperStoreSelectorContextValue | null>(null);

export function PaperStoreProvider({
  config,
  paperMap,
  defaultOpenState,
  isFullscreen,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
  onFullscreenChange,
  children,
}: PaperStoreProviderProps) {
  const selectorStoreRef = useRef<{
    listeners: Set<PaperStoreListener>;
    snapshot: PaperStoreSnapshot;
    api: PaperStoreSelectorContextValue;
  } | null>(null);
  const [state, rawDispatch] = useReducer(
    (currentState: PaperViewState, command: Command) => reduce(currentState, command, config),
    undefined,
    () => createInitialState(paperMap, config, [], defaultOpenState),
  );

  if (selectorStoreRef.current === null) {
    const listeners = new Set<PaperStoreListener>();
    const snapshot = { state, config };
    selectorStoreRef.current = {
      listeners,
      snapshot,
      api: {
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot: () => selectorStoreRef.current!.snapshot,
      },
    };
  }

  // Keep snapshot current during render so getSnapshot() is always up-to-date.
  if (
    selectorStoreRef.current.snapshot.state !== state ||
    selectorStoreRef.current.snapshot.config !== config
  ) {
    selectorStoreRef.current.snapshot = { state, config };
  }

  const lastSyncedPaperMapRef = useRef(paperMap);

  useEffect(() => {
    if (paperMap !== lastSyncedPaperMapRef.current) {
      lastSyncedPaperMapRef.current = paperMap;
      rawDispatch({ type: '__SYNC_PAPER_MAP', paperMap });
    }
  }, [paperMap]);

  const dispatch = useCallback(
    (command: Command) => {
      if (typeof window !== 'undefined' && (window as { __pipDebug?: boolean }).__pipDebug) {
        console.log('[pip-debug] dispatch', command.type, 'nodeId' in command ? command.nodeId : '');
      }
      rawDispatch(command);
    },
    [],
  );

  // Notify useSyncExternalStore subscribers after React commits the new snapshot.
  useEffect(() => {
    for (const listener of selectorStoreRef.current!.listeners) {
      listener();
    }
  }, [state, config]);

  // fire callbacks when relevant state slices change
  useEffect(() => {
    if (!onPaperMapChange || state.paperMap === lastSyncedPaperMapRef.current) return;
    lastSyncedPaperMapRef.current = state.paperMap;
    onPaperMapChange(state.paperMap);
  }, [state.paperMap, onPaperMapChange]);

  useEffect(() => {
    onExpansionMapChange?.(state.expansionMap);
  }, [state.expansionMap, onExpansionMapChange]);

  useEffect(() => {
    onFocusedNodeIdChange?.(state.focusedNodeId);
  }, [state.focusedNodeId, onFocusedNodeIdChange]);

  return (
    <PaperStoreSelectorContext.Provider value={selectorStoreRef.current.api}>
      <PaperDispatchContext.Provider value={dispatch}>
        <PaperStoreContext value={{ config, state, isFullscreen: isFullscreen ?? false, onFullscreenChange }}>
          {children}
        </PaperStoreContext>
      </PaperDispatchContext.Provider>
    </PaperStoreSelectorContext.Provider>
  );
}

export function usePaperDispatch() {
  const dispatch = useContext(PaperDispatchContext);
  if (!dispatch) throw new Error('usePaperDispatch must be used inside PaperStoreProvider');
  return dispatch;
}

export function usePaperStoreSelector<T>(
  selector: (snapshot: PaperStoreSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
) {
  const store = useContext(PaperStoreSelectorContext);
  if (!store) throw new Error('usePaperStoreSelector must be used inside PaperStoreProvider');

  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  // Cache the last selected value so the getSnapshot function can return a
  // stable reference when the selected value hasn't changed — this lets
  // useSyncExternalStore skip re-renders even when the full snapshot changed.
  const cachedRef = useRef<{ snap: PaperStoreSnapshot; value: T } | null>(null);

  return useSyncExternalStore(
    store.subscribe,
    () => {
      const snap = store.getSnapshot();
      if (cachedRef.current !== null && cachedRef.current.snap === snap) {
        return cachedRef.current.value;
      }
      const next = selectorRef.current(snap);
      if (cachedRef.current !== null && isEqualRef.current(cachedRef.current.value, next)) {
        cachedRef.current = { snap, value: cachedRef.current.value };
        return cachedRef.current.value;
      }
      cachedRef.current = { snap, value: next };
      return next;
    },
  );
}

export function usePaperStoreApi() {
  const store = useContext(PaperStoreSelectorContext);
  if (!store) throw new Error('usePaperStoreApi must be used inside PaperStoreProvider');
  return store;
}
