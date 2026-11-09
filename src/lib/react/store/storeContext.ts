import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { Command } from '../../core/commands';
import type { NodeLayoutEntry } from '../../core/layout';
import type { PaperId } from '../../core/types';
import type { PaperStore, PaperStoreSnapshot } from './createPaperStore';

export const PaperStoreContext = createContext<PaperStore | null>(null);

/** The canvas store. Throws outside a PaperCanvas. */
export function usePaperStoreApi(): PaperStore {
  const store = useContext(PaperStoreContext);
  if (!store) throw new Error('paper-in-paper hooks must be used inside <PaperCanvas>');
  return store;
}

/**
 * Subscribes to one value of the snapshot. The selector must return something that stays
 * identical while the input does not change (a primitive, or an object taken from the
 * snapshot), which is what keeps unrelated papers from re-rendering.
 */
export function useStoreValue<T>(selector: (snapshot: PaperStoreSnapshot) => T): T {
  const store = usePaperStoreApi();
  const getValue = () => selector(store.getSnapshot());
  return useSyncExternalStore(store.subscribe, getValue, getValue);
}

/** The layout of one paper; the same object until that paper's layout changes. */
export function useLayoutEntry(nodeId: PaperId): NodeLayoutEntry | undefined {
  return useStoreValue((snapshot) => snapshot.layout.entries.get(nodeId));
}

export function usePaperDispatch(): (command: Command) => void {
  return usePaperStoreApi().dispatch;
}

/**
 * Selects a slice of the canvas state for React content rendered inside a paper. Re-renders
 * only when `isEqual` says the selection changed, so a selector may build a new object.
 */
export function usePaperStoreSelector<T>(
  selector: (snapshot: PaperStoreSnapshot) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = usePaperStoreApi();
  // Keyed on the selector: a new selector function starts a fresh memo, which is correct
  // (it may select something else) and cheap.
  const getSelection = useMemo(() => {
    let memo: { snapshot: PaperStoreSnapshot; value: T } | null = null;
    return () => {
      const snapshot = store.getSnapshot();
      if (memo !== null && memo.snapshot === snapshot) return memo.value;
      const value = selector(snapshot);
      // A cache local to this getSnapshot closure (what use-sync-external-store/with-selector
      // does): it only ever holds what the last call returned, so it cannot go stale.
      // eslint-disable-next-line react-hooks/immutability
      memo = memo !== null && isEqual(memo.value, value) ? { snapshot, value: memo.value } : { snapshot, value };
      return memo.value;
    };
  }, [store, selector, isEqual]);
  return useSyncExternalStore(store.subscribe, getSelection, getSelection);
}
