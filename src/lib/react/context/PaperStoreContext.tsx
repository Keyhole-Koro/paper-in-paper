import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PaperMap, PaperViewState } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import { type Command, type DefaultOpenState, createInitialState, reduce } from '../../core/commands';

export interface PaperStoreProviderProps {
  config: PaperCanvasConfig;
  paperMap: PaperMap;
  defaultOpenState?: DefaultOpenState;
  isFullscreen?: boolean;
  onPaperMapChange?: (paperMap: PaperMap) => void;
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
  onFullscreenChange,
  children,
}: PaperStoreProviderProps) {
  // Optimization store for node-level selectors. This runs alongside the
  // normal React context so existing non-recursive consumers can stay simple.
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

  const lastSyncedPaperMapRef = useRef(paperMap);

  useEffect(() => {
    if (paperMap !== lastSyncedPaperMapRef.current) {
      lastSyncedPaperMapRef.current = paperMap;
      rawDispatch({ type: '__SYNC_PAPER_MAP', paperMap });
    }
  }, [paperMap]);

  // wrap dispatch to fire callbacks after each command
  const dispatch = useCallback(
    (command: Command) => {
      rawDispatch(command);
    },
    [],
  );

  // fire callbacks when relevant state slices change
  useEffect(() => {
    if (!onPaperMapChange || state.paperMap === lastSyncedPaperMapRef.current) return;
    lastSyncedPaperMapRef.current = state.paperMap;
    onPaperMapChange(state.paperMap);
  }, [state.paperMap, onPaperMapChange]);

  useEffect(() => {
    if (!selectorStoreRef.current) return;
    selectorStoreRef.current.snapshot = { state, config };
    for (const listener of selectorStoreRef.current.listeners) {
      listener();
    }
  }, [state, config]);

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

  const [selected, setSelected] = useState(() => selector(store.getSnapshot()));

  useEffect(() => {
    // Optimization: update selector results only when the subscription store
    // publishes a new snapshot, and drop no-op updates with isEqual.
    const update = () => {
      const next = selectorRef.current(store.getSnapshot());
      setSelected((prev) => (isEqualRef.current(prev, next) ? prev : next));
    };
    update();
    return store.subscribe(update);
  }, [store]);

  return selected;
}

export function usePaperStoreApi() {
  const store = useContext(PaperStoreSelectorContext);
  if (!store) throw new Error('usePaperStoreApi must be used inside PaperStoreProvider');
  return store;
}
