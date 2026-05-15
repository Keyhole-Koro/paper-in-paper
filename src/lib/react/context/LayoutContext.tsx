import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { PaperId } from '../../core/types';
import type { LayoutRect, NodeRoomLayout } from '../../core/layout';

export interface NodeLayoutEntry {
  allocatedRect: LayoutRect;
  roomLayout: NodeRoomLayout;
}

type LayoutListener = () => void;
interface LayoutStore {
  subscribe: (listener: LayoutListener) => () => void;
  getSnapshot: () => Map<PaperId, NodeLayoutEntry>;
}
// Optimization layer: lets PaperNode subscribe to its own layout entry
// instead of re-reading the whole layoutMap on every update.
const LayoutSelectorContext = createContext<LayoutStore | null>(null);

export function LayoutContextProvider({
  layoutMap,
  children,
}: {
  layoutMap: Map<PaperId, NodeLayoutEntry>;
  children: ReactNode;
}) {
  const storeRef = useRef<{
    listeners: Set<LayoutListener>;
    snapshot: Map<PaperId, NodeLayoutEntry>;
    store: LayoutStore;
  } | null>(null);

  if (storeRef.current === null) {
    const listeners = new Set<LayoutListener>();
    storeRef.current = {
      listeners,
      snapshot: layoutMap,
      store: {
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getSnapshot: () => storeRef.current!.snapshot,
      },
    };
  }

  // Keep snapshot current so getSnapshot() always returns the latest layoutMap.
  // Do this during render (not in useEffect) so useSyncExternalStore reads the
  // updated value synchronously on the same render pass.
  storeRef.current.snapshot = layoutMap;

  useEffect(() => {
    // Notify subscribers after React commits the new layoutMap so they
    // re-read the snapshot and schedule re-renders as needed.
    // useSyncExternalStore handles tearing prevention internally.
    for (const listener of storeRef.current!.listeners) {
      listener();
    }
  }, [layoutMap]);

  return (
    <LayoutSelectorContext.Provider value={storeRef.current.store}>{children}</LayoutSelectorContext.Provider>
  );
}

export function useLayoutEntry(nodeId: PaperId | null) {
  const store = useContext(LayoutSelectorContext);
  if (!store) throw new Error('useLayoutEntry must be used inside LayoutContextProvider');

  const nodeIdRef = useRef(nodeId);
  nodeIdRef.current = nodeId;

  // Entry references are stabilized in useCanvasLayoutSnapshot, so
  // Object.is comparison inside useSyncExternalStore correctly skips
  // re-renders when the node's layout hasn't changed.
  return useSyncExternalStore(
    store.subscribe,
    () => (nodeIdRef.current ? store.getSnapshot().get(nodeIdRef.current) : undefined),
  );
}
