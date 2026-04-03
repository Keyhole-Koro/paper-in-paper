import { createContext, useCallback, useContext, useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';
import type { ExpansionMap, PaperId, PaperMap, PaperViewState } from '../../core/types';
import { type Command, createInitialState, reduce } from '../../core/commands';

export interface PaperStoreProviderProps {
  paperMap: PaperMap;
  unplacedNodeIds?: PaperId[];
  expansionMap?: ExpansionMap;
  focusedNodeId?: PaperId | null;
  onPaperMapChange?: (paperMap: PaperMap) => void;
  onExpansionMapChange?: (expansionMap: ExpansionMap) => void;
  onFocusedNodeIdChange?: (paperId: PaperId | null) => void;
  onUnplacedNodeIdsChange?: (ids: PaperId[]) => void;
  children: ReactNode;
}

interface PaperStoreContextValue {
  state: PaperViewState;
  dispatch: (command: Command) => void;
}

const PaperStoreContext = createContext<PaperStoreContextValue | null>(null);

export function PaperStoreProvider({
  paperMap,
  unplacedNodeIds,
  expansionMap,
  focusedNodeId,
  onPaperMapChange,
  onExpansionMapChange,
  onFocusedNodeIdChange,
  onUnplacedNodeIdsChange,
  children,
}: PaperStoreProviderProps) {
  const [state, rawDispatch] = useReducer(reduce, undefined, () =>
    createInitialState(paperMap, unplacedNodeIds ?? []),
  );

  // controlled props → sync into internal state when they change
  useEffect(() => {
    if (expansionMap !== undefined && expansionMap !== state.expansionMap) {
      rawDispatch({ type: '__SYNC_EXPANSION' as never, expansionMap } as never);
    }
  }, [expansionMap]);

  useEffect(() => {
    if (focusedNodeId !== undefined && focusedNodeId !== state.focusedNodeId) {
      rawDispatch({ type: '__SYNC_FOCUSED' as never, focusedNodeId } as never);
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
    onPaperMapChange?.(state.paperMap);
  }, [state.paperMap]);

  useEffect(() => {
    onExpansionMapChange?.(state.expansionMap);
  }, [state.expansionMap]);

  useEffect(() => {
    onFocusedNodeIdChange?.(state.focusedNodeId);
  }, [state.focusedNodeId]);

  useEffect(() => {
    onUnplacedNodeIdsChange?.(state.unplacedNodeIds);
  }, [state.unplacedNodeIds]);

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
