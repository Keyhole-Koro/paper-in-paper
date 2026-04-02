/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { PaperId, PaperMap } from '../../../core/types';
import {
  computeAutoLayout,
  DEFAULT_LAYOUT_OPTIONS,
  type LayoutOptions,
  type LayoutOptionsInput,
  type NodeSize,
} from '../node/utils/layoutHelpers';

interface ParentLayoutState {
  openChildIds: PaperId[];
  primaryChildId: PaperId | null;
}

interface LayoutState {
  accessMap: Map<PaperId, number>;
  lockedSizes: Map<PaperId, NodeSize>;
  parentStates: Map<PaperId, ParentLayoutState>;
}

type LayoutAction =
  | { type: 'ACCESS'; paperId: PaperId }
  | { type: 'OPEN'; parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE'; parentId: PaperId; childId: PaperId }
  | { type: 'SET_PRIMARY'; parentId: PaperId; childId: PaperId }
  | { type: 'RESIZE'; paperId: PaperId; size: NodeSize };

interface LayoutContextValue {
  getSize: (paperId: PaperId) => NodeSize;
  getNodeState: (parentId: PaperId) => ParentLayoutState;
  options: LayoutOptions;
  openNode: (parentId: PaperId, childId: PaperId) => void;
  closeNode: (parentId: PaperId, childId: PaperId) => void;
  setPrimaryNode: (parentId: PaperId, childId: PaperId) => void;
  onAccess: (paperId: PaperId) => void;
  onResize: (paperId: PaperId, size: NodeSize) => void;
}

const EMPTY_PARENT_STATE: ParentLayoutState = { openChildIds: [], primaryChildId: null };

const LayoutContext = createContext<LayoutContextValue>({
  getSize: () => 'md',
  getNodeState: () => EMPTY_PARENT_STATE,
  options: DEFAULT_LAYOUT_OPTIONS,
  openNode: () => {},
  closeNode: () => {},
  setPrimaryNode: () => {},
  onAccess: () => {},
  onResize: () => {},
});

function clearSubtree(parentStates: Map<PaperId, ParentLayoutState>, paperMap: PaperMap, paperId: PaperId) {
  const current = parentStates.get(paperId);
  if (!current) return;
  for (const childId of current.openChildIds) {
    clearSubtree(parentStates, paperMap, childId);
  }
  parentStates.delete(paperId);
}

function pruneParentState(
  parentState: ParentLayoutState,
  accessMap: Map<PaperId, number>,
  parentStates: Map<PaperId, ParentLayoutState>,
  paperMap: PaperMap,
  options: LayoutOptions,
): ParentLayoutState {
  if (parentState.openChildIds.length <= options.maxOpenChildrenPerParent) return parentState;

  const ranked = [...parentState.openChildIds].sort(
    (a, b) => (accessMap.get(b) ?? 0) - (accessMap.get(a) ?? 0),
  );
  const keep = new Set(ranked.slice(0, options.maxOpenChildrenPerParent));
  const prunedOpenChildIds = parentState.openChildIds.filter((id) => keep.has(id));

  for (const childId of parentState.openChildIds) {
    if (!keep.has(childId)) {
      clearSubtree(parentStates, paperMap, childId);
    }
  }

  return {
    openChildIds: prunedOpenChildIds,
    primaryChildId: keep.has(parentState.primaryChildId ?? '') ? parentState.primaryChildId : (prunedOpenChildIds.at(-1) ?? null),
  };
}

function createReducer(paperMap: PaperMap, options: LayoutOptions) {
  return function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
    switch (action.type) {
      case 'ACCESS': {
        const accessMap = new Map(state.accessMap);
        accessMap.set(action.paperId, Date.now());
        return { ...state, accessMap };
      }
      case 'OPEN': {
        const accessMap = new Map(state.accessMap);
        accessMap.set(action.childId, Date.now());

        const parentStates = new Map(state.parentStates);
        const current = parentStates.get(action.parentId) ?? EMPTY_PARENT_STATE;
        const alreadyOpen = current.openChildIds.includes(action.childId);
        const nextState = {
          openChildIds: alreadyOpen ? current.openChildIds : [...current.openChildIds, action.childId],
          primaryChildId: action.childId,
        };
        parentStates.set(
          action.parentId,
          pruneParentState(nextState, accessMap, parentStates, paperMap, options),
        );

        return { ...state, accessMap, parentStates };
      }
      case 'CLOSE': {
        const parentStates = new Map(state.parentStates);
        const current = parentStates.get(action.parentId);
        if (!current) return state;

        const openChildIds = current.openChildIds.filter((id) => id !== action.childId);
        const primaryChildId =
          current.primaryChildId === action.childId ? (openChildIds.at(-1) ?? null) : current.primaryChildId;

        parentStates.set(action.parentId, { openChildIds, primaryChildId });
        clearSubtree(parentStates, paperMap, action.childId);
        return { ...state, parentStates };
      }
      case 'SET_PRIMARY': {
        const parentStates = new Map(state.parentStates);
        const current = parentStates.get(action.parentId) ?? EMPTY_PARENT_STATE;
        if (!current.openChildIds.includes(action.childId)) {
          return state;
        }
        parentStates.set(action.parentId, { ...current, primaryChildId: action.childId });
        return { ...state, parentStates };
      }
      case 'RESIZE': {
        const lockedSizes = new Map(state.lockedSizes);
        lockedSizes.set(action.paperId, action.size);
        return { ...state, lockedSizes };
      }
      default:
        return state;
    }
  };
}

export function useLayout(): LayoutContextValue {
  return useContext(LayoutContext);
}

export function LayoutProvider({
  children,
  paperMap,
  options,
}: {
  children: React.ReactNode;
  paperMap: PaperMap;
  options?: LayoutOptionsInput;
}) {
  const mergedOptions = useMemo<LayoutOptions>(() => ({
    ...DEFAULT_LAYOUT_OPTIONS,
    ...options,
    gridColumns: { ...DEFAULT_LAYOUT_OPTIONS.gridColumns, ...options?.gridColumns },
    gridRowHeight: { ...DEFAULT_LAYOUT_OPTIONS.gridRowHeight, ...options?.gridRowHeight },
    singleOpen: { ...DEFAULT_LAYOUT_OPTIONS.singleOpen, ...options?.singleOpen },
    descendantPressure: { ...DEFAULT_LAYOUT_OPTIONS.descendantPressure, ...options?.descendantPressure },
  }), [options]);

  const [state, dispatch] = useReducer(createReducer(paperMap, mergedOptions), {
    accessMap: new Map(),
    lockedSizes: new Map(),
    parentStates: new Map(),
  });

  const allOpenIds = useMemo(() => {
    const ids = new Set<PaperId>();
    for (const { openChildIds } of state.parentStates.values()) {
      for (const id of openChildIds) ids.add(id);
    }
    return [...ids];
  }, [state.parentStates]);

  const computedLayout = useMemo(
    () => computeAutoLayout(allOpenIds, state.accessMap, state.lockedSizes),
    [allOpenIds, state.accessMap, state.lockedSizes],
  );

  const getSize = useCallback(
    (paperId: PaperId): NodeSize => computedLayout.get(paperId) ?? 'md',
    [computedLayout],
  );

  const getNodeState = useCallback(
    (parentId: PaperId): ParentLayoutState => state.parentStates.get(parentId) ?? EMPTY_PARENT_STATE,
    [state.parentStates],
  );

  const openNode = useCallback((parentId: PaperId, childId: PaperId) => {
    dispatch({ type: 'OPEN', parentId, childId });
  }, []);

  const closeNode = useCallback((parentId: PaperId, childId: PaperId) => {
    dispatch({ type: 'CLOSE', parentId, childId });
  }, []);

  const setPrimaryNode = useCallback((parentId: PaperId, childId: PaperId) => {
    dispatch({ type: 'SET_PRIMARY', parentId, childId });
  }, []);

  const onAccess = useCallback((paperId: PaperId) => {
    dispatch({ type: 'ACCESS', paperId });
  }, []);

  const onResize = useCallback((paperId: PaperId, size: NodeSize) => {
    dispatch({ type: 'RESIZE', paperId, size });
  }, []);

  const value = useMemo(
    () => ({ getSize, getNodeState, options: mergedOptions, openNode, closeNode, setPrimaryNode, onAccess, onResize }),
    [getSize, getNodeState, mergedOptions, openNode, closeNode, setPrimaryNode, onAccess, onResize],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}
