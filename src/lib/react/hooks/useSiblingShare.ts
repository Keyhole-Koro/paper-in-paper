import { useCallback, useMemo } from 'react';
import type { Paper, PaperId } from '../../core/types';
import { getVisibleChildIds } from '../../core/expansion';
import type { PaperStoreSnapshot } from '../store/createPaperStore';
import { usePaperStoreSelector, useStoreValue } from '../store/storeContext';

/** Anything with an `id` field works — Paper, builder output, or `{ id }`. */
type PaperRef = Pick<Paper, 'id'>;

export interface SiblingShareOptions {
  /** Share given to the focused child (0–1). Defaults to equal split across open children. */
  whenFocused?: number;
}

export interface SiblingShareResult {
  /** Returns the share (0–1) for the given child paper. */
  shareOf: (child: PaperRef) => number;
}

function sameIds(a: readonly PaperId[], b: readonly PaperId[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Returns a preview room share for each open child of the given parent paper.
 *
 * When `whenFocused` is provided and a child is currently focused,
 * that child receives `whenFocused` share and the rest split the remainder equally.
 * Otherwise falls back to equal split across open children.
 *
 * This is a UI-facing helper, not the layout engine's source of truth.
 * It does not account for attention, content demand, or pinned layout.
 */
export function useSiblingShare(
  parent: PaperRef,
  options: SiblingShareOptions = {},
): SiblingShareResult {
  const { whenFocused } = options;
  const parentId = parent.id;

  const focusedNodeId = useStoreValue((snapshot) => snapshot.state.focusedNodeId);
  const selectOpenChildIds = useCallback(
    (snapshot: PaperStoreSnapshot) => getVisibleChildIds(snapshot.state.paperMap, snapshot.state.expansionMap, parentId),
    [parentId],
  );
  const openChildIds = usePaperStoreSelector(selectOpenChildIds, sameIds);

  const shares = useMemo(() => {
    const result = new Map<PaperId, number>();
    const count = openChildIds.length;
    if (count === 0) return result;
    const focusedChildId = focusedNodeId !== null && openChildIds.includes(focusedNodeId) ? focusedNodeId : null;
    if (whenFocused !== undefined && focusedChildId !== null) {
      const focusedShare = Math.min(Math.max(whenFocused, 0), 1);
      const restShare = count > 1 ? (1 - focusedShare) / (count - 1) : 0;
      for (const id of openChildIds) result.set(id, id === focusedChildId ? focusedShare : restShare);
    } else {
      for (const id of openChildIds) result.set(id, 1 / count);
    }
    return result;
  }, [openChildIds, focusedNodeId, whenFocused]);

  const shareOf = useCallback((child: PaperRef) => shares.get(child.id) ?? 0, [shares]);

  return { shareOf };
}
