import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ExpansionMap, PaperId, PaperMap, PaperViewState } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import { type Command, createInitialState, reduce } from '../../core/commands';

export interface PaperStoreProviderProps {
  config: PaperCanvasConfig;
  paperMap: PaperMap;
  expansionMap?: ExpansionMap;
  focusedNodeId?: PaperId | null;
  isFullscreen?: boolean;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (paperId: PaperId | null) => void;
  onFullscreenChange?: (fullscreen: boolean) => void;
  children: ReactNode;
}

interface PaperStoreContextValue {
  config: PaperCanvasConfig;
  state: PaperViewState;
  dispatch: (command: Command) => void;
  isFullscreen: boolean;
  onFullscreenChange?: (fullscreen: boolean) => void;
}

const PaperStoreContext = createContext<PaperStoreContextValue | null>(null);

export function PaperStoreProvider({
  config,
  paperMap,
  expansionMap,
  focusedNodeId,
  isFullscreen,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
  onFullscreenChange,
  children,
}: PaperStoreProviderProps) {
  const [state, rawDispatch] = useReducer(
    (currentState: PaperViewState, command: Command) => reduce(currentState, command, config),
    undefined,
    () => createInitialState(paperMap, config),
  );

  const lastSyncedPaperMapRef = useRef(paperMap);
  // Tracks the last expansionMap received from outside (inbound prop).
  // Prevents re-dispatching a value we already synced from the parent.
  // Initialized as undefined (not the initial prop) so the first value is always dispatched.
  const lastInboundExpansionMapRef = useRef<ExpansionMap | undefined>(undefined);
  // Tracks the last expansionMap we sent outward via onExpansionMapChange.
  // When the parent echoes it back as a prop, we skip the inbound sync to avoid an echo loop.
  const lastOutboundExpansionMapRef = useRef<ExpansionMap | undefined>(undefined);
  const lastSyncedFocusedNodeIdRef = useRef(focusedNodeId);

  useEffect(() => {
    if (paperMap !== lastSyncedPaperMapRef.current) {
      lastSyncedPaperMapRef.current = paperMap;
      rawDispatch({ type: '__SYNC_PAPER_MAP', paperMap });
    }
  }, [paperMap]);

  useEffect(() => {
    if (expansionMap === undefined) return; // not a controlled prop
    if (expansionMap === lastOutboundExpansionMapRef.current) return; // echo from our own outbound update
    if (expansionMap === lastInboundExpansionMapRef.current) return; // no change
    lastInboundExpansionMapRef.current = expansionMap;
    rawDispatch({ type: '__SYNC_EXPANSION', expansionMap });
  }, [expansionMap]);

  useEffect(() => {
    if (focusedNodeId !== undefined && focusedNodeId !== lastSyncedFocusedNodeIdRef.current) {
      lastSyncedFocusedNodeIdRef.current = focusedNodeId;
      rawDispatch({ type: '__SYNC_FOCUSED', focusedNodeId });
    }
  }, [focusedNodeId]);


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
    if (!onExpansionMapChange || state.expansionMap === lastOutboundExpansionMapRef.current) return;
    lastOutboundExpansionMapRef.current = state.expansionMap;
    lastInboundExpansionMapRef.current = state.expansionMap;
    onExpansionMapChange(state.expansionMap);
  }, [state.expansionMap, onExpansionMapChange]);

  useEffect(() => {
    if (!onFocusedNodeIdChange || state.focusedNodeId === lastSyncedFocusedNodeIdRef.current) return;
    lastSyncedFocusedNodeIdRef.current = state.focusedNodeId;
    onFocusedNodeIdChange(state.focusedNodeId);
  }, [state.focusedNodeId, onFocusedNodeIdChange]);

  return (
    <PaperStoreContext value={{ config, state, dispatch, isFullscreen: isFullscreen ?? false, onFullscreenChange }}>
      {children}
    </PaperStoreContext>
  );
}

export function usePaperStore() {
  const ctx = useContext(PaperStoreContext);
  if (!ctx) throw new Error('usePaperStore must be used inside PaperStoreProvider');
  return ctx;
}
