import React, { createContext, useContext, useReducer } from 'react';
import type { PaperId, PaperMap, ExpansionMap } from './types';
import { buildPaperMap } from './data';

interface State {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
}

type Action =
  | { type: 'OPEN';        parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE';       paperId: PaperId;  parentId: PaperId }
  | { type: 'SET_PRIMARY'; parentId: PaperId; childId: PaperId };

function reducer(state: State, action: Action): State {
  const em: ExpansionMap = new Map(state.expansionMap);

  switch (action.type) {
    case 'OPEN': {
      const cur = em.get(action.parentId) ?? { openChildIds: [], primaryChildId: null };
      const alreadyOpen = cur.openChildIds.includes(action.childId);
      em.set(action.parentId, {
        openChildIds: alreadyOpen ? cur.openChildIds : [...cur.openChildIds, action.childId],
        primaryChildId: action.childId,
      });
      return { ...state, expansionMap: em };
    }

    case 'CLOSE': {
      const cur = em.get(action.parentId);
      if (!cur) return state;
      const newOpenIds = cur.openChildIds.filter(id => id !== action.paperId);
      // If the closed one was primary, promote the most recently opened remaining
      const newPrimary =
        cur.primaryChildId === action.paperId ? (newOpenIds.at(-1) ?? null) : cur.primaryChildId;
      em.set(action.parentId, { openChildIds: newOpenIds, primaryChildId: newPrimary });
      // Recursively clear expansion state of the closed subtree
      clearSubtree(em, action.paperId, state.paperMap);
      return { ...state, expansionMap: em };
    }

    case 'SET_PRIMARY': {
      const cur = em.get(action.parentId) ?? { openChildIds: [], primaryChildId: null };
      em.set(action.parentId, { ...cur, primaryChildId: action.childId });
      return { ...state, expansionMap: em };
    }

    default:
      return state;
  }
}

function clearSubtree(em: ExpansionMap, paperId: PaperId, paperMap: PaperMap) {
  const exp = em.get(paperId);
  if (exp) {
    exp.openChildIds.forEach(childId => clearSubtree(em, childId, paperMap));
    em.delete(paperId);
  }
}

interface StoreValue {
  state: State;
  dispatch: React.Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);
const paperMap = buildPaperMap();

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { paperMap, expansionMap: new Map() });
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
