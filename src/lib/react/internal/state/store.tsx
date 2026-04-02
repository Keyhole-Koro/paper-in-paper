/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useReducer } from 'react';
import { expansionReducer, type ExpansionAction } from '../../../core/expansion';
import type { ExpansionMap, PaperMap } from '../../../core/types';

interface State {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
}

interface StoreValue {
  state: State;
  dispatch: React.Dispatch<ExpansionAction>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({
  children,
  paperMap,
}: {
  children: React.ReactNode;
  paperMap: PaperMap;
}) {
  const [state, dispatch] = useReducer(expansionReducer, { paperMap, expansionMap: new Map() });

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);

  if (!context) {
    throw new Error('useStore must be used within StoreProvider');
  }

  return context;
}
