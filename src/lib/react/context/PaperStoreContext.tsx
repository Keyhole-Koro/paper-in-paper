import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';
import type { ExpansionMap, PaperId, PaperMap, PaperViewState } from '../../core/types';
import { type Command, createInitialState, reduce } from '../../core/commands';

export interface PaperStoreProviderProps {
  paperMap: PaperMap;
  expansionMap?: ExpansionMap;
  focusedNodeId?: PaperId | null;
  spotlightNodeId?: PaperId | null;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (paperId: PaperId | null) => void;
  onSpotlightNodeIdChange?: (paperId: PaperId | null) => void;
  children: ReactNode;
}

interface PaperStoreContextValue {
  state: PaperViewState;
  dispatch: (command: Command) => void;
}

const PaperStoreContext = createContext<PaperStoreContextValue | null>(null);

export function PaperStoreProvider({
  paperMap,
  expansionMap,
  focusedNodeId,
  spotlightNodeId,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
  onSpotlightNodeIdChange,
  children,
}: PaperStoreProviderProps) {
  const [state, rawDispatch] = useReducer(reduce, undefined, () =>
    createInitialState(paperMap),
  );

  const lastSyncedPaperMapRef = useRef(paperMap);
  const lastSyncedExpansionMapRef = useRef(expansionMap);
  const lastSyncedFocusedNodeIdRef = useRef(focusedNodeId);
  const lastSyncedSpotlightNodeIdRef = useRef(spotlightNodeId);

  useEffect(() => {
    if (paperMap !== lastSyncedPaperMapRef.current) {
      lastSyncedPaperMapRef.current = paperMap;
      rawDispatch({ type: '__SYNC_PAPER_MAP', paperMap });
    }
  }, [paperMap]);

  useEffect(() => {
    if (expansionMap !== undefined && expansionMap !== lastSyncedExpansionMapRef.current) {
      lastSyncedExpansionMapRef.current = expansionMap;
      rawDispatch({ type: '__SYNC_EXPANSION', expansionMap });
    }
  }, [expansionMap]);

  useEffect(() => {
    if (focusedNodeId !== undefined && focusedNodeId !== lastSyncedFocusedNodeIdRef.current) {
      lastSyncedFocusedNodeIdRef.current = focusedNodeId;
      rawDispatch({ type: '__SYNC_FOCUSED', focusedNodeId });
    }
  }, [focusedNodeId]);

  useEffect(() => {
    if (spotlightNodeId !== undefined && spotlightNodeId !== lastSyncedSpotlightNodeIdRef.current) {
      lastSyncedSpotlightNodeIdRef.current = spotlightNodeId;
      if (spotlightNodeId === null) {
        rawDispatch({ type: 'EXIT_SPOTLIGHT' });
      } else {
        rawDispatch({ type: 'SPOTLIGHT_NODE', nodeId: spotlightNodeId });
      }
    }
  }, [spotlightNodeId]);

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
    if (!onExpansionMapChange || state.expansionMap === lastSyncedExpansionMapRef.current) return;
    lastSyncedExpansionMapRef.current = state.expansionMap;
    onExpansionMapChange(state.expansionMap);
  }, [state.expansionMap, onExpansionMapChange]);

  useEffect(() => {
    if (!onFocusedNodeIdChange || state.focusedNodeId === lastSyncedFocusedNodeIdRef.current) return;
    lastSyncedFocusedNodeIdRef.current = state.focusedNodeId;
    onFocusedNodeIdChange(state.focusedNodeId);
  }, [state.focusedNodeId, onFocusedNodeIdChange]);

  useEffect(() => {
    if (!onSpotlightNodeIdChange || state.spotlightNodeId === lastSyncedSpotlightNodeIdRef.current) return;
    lastSyncedSpotlightNodeIdRef.current = state.spotlightNodeId;
    onSpotlightNodeIdChange(state.spotlightNodeId);
  }, [state.spotlightNodeId, onSpotlightNodeIdChange]);

  return (
    <PaperStoreContext value={{ state, dispatch }}>
      {children}
    </PaperStoreContext>
  );
}

export function usePaperStore() {
  const ctx = useContext(PaperStoreContext);
  if (!ctx) throw new Error('usePaperStore must be used inside PaperStoreProvider');
  return ctx;
}
