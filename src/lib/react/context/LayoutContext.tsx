import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PaperId } from '../../core/types';
import type { LayoutRect, NodeRoomLayout } from '../../core/layout';

export interface NodeLayoutEntry {
  allocatedRect: LayoutRect;
  roomLayout: NodeRoomLayout;
}

type LayoutListener = () => void;
interface LayoutSelectorContextValue {
  subscribe: (listener: LayoutListener) => () => void;
  getSnapshot: () => Map<PaperId, NodeLayoutEntry>;
}
// Optimization layer: lets PaperNode subscribe to its own layout entry
// instead of re-reading the whole layoutMap on every update.
const LayoutSelectorContext = createContext<LayoutSelectorContextValue | null>(null);

export function LayoutContextProvider({
  layoutMap,
  children,
}: {
  layoutMap: Map<PaperId, NodeLayoutEntry>;
  children: ReactNode;
}) {
  // Optimization store for node-level layout subscriptions.
  const selectorStoreRef = useRef<{
    listeners: Set<LayoutListener>;
    snapshot: Map<PaperId, NodeLayoutEntry>;
    api: LayoutSelectorContextValue;
  } | null>(null);

  if (selectorStoreRef.current === null) {
    const listeners = new Set<LayoutListener>();
    selectorStoreRef.current = {
      listeners,
      snapshot: layoutMap,
      api: {
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot: () => selectorStoreRef.current!.snapshot,
      },
    };
  }

  useEffect(() => {
    if (!selectorStoreRef.current) return;
    selectorStoreRef.current.snapshot = layoutMap;
    for (const listener of selectorStoreRef.current.listeners) {
      listener();
    }
  }, [layoutMap]);

  return (
    <LayoutSelectorContext.Provider value={selectorStoreRef.current.api}>{children}</LayoutSelectorContext.Provider>
  );
}

export function useLayoutEntry(nodeId: PaperId | null) {
  const store = useContext(LayoutSelectorContext);
  if (!store) throw new Error('useLayoutEntry must be used inside LayoutContextProvider');

  const [entry, setEntry] = useState(() => (nodeId ? store.getSnapshot().get(nodeId) : undefined));
  const nodeIdRef = useRef(nodeId);
  nodeIdRef.current = nodeId;

  useEffect(() => {
    // Optimization: only notify this consumer when its own entry reference
    // changes, even if the provider publishes a new layoutMap object.
    const update = () => {
      const next = nodeIdRef.current ? store.getSnapshot().get(nodeIdRef.current) : undefined;
      setEntry((prev) => (prev === next ? prev : next));
    };
    update();
    return store.subscribe(update);
  }, [store]);

  return entry;
}
