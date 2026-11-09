import { createContext, useContext, useSyncExternalStore } from 'react';
import type { DragSnapshot, DragStore } from './dragStore';

export const DragStoreContext = createContext<DragStore | null>(null);

export function useDragStore(): DragStore {
  const store = useContext(DragStoreContext);
  if (!store) throw new Error('paper-in-paper drag hooks must be used inside <PaperCanvas>');
  return store;
}

/** Subscribes to one value of the drag state; the selector must return a stable value. */
export function useDragValue<T>(selector: (snapshot: DragSnapshot) => T): T {
  const store = useDragStore();
  const getValue = () => selector(store.getSnapshot());
  return useSyncExternalStore(store.subscribe, getValue, getValue);
}
