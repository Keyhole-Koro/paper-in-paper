import { useMemo } from 'react';
import type { Paper } from '../../core/types';
import { getOpenChildIds } from '../../core/expansion';
import { usePaperStoreSelector } from '../context/PaperStoreContext';

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

  const focusedNodeId = usePaperStoreSelector(({ state }) => state.focusedNodeId);
  const openChildIds = usePaperStoreSelector(
    ({ state }) => getOpenChildIds(state.expansionMap, parent.id),
    (a, b) => a.length === b.length && a.every((id, i) => id === b[i]),
  );

  const shareOf = useMemo(() => {
    const count = openChildIds.length;
    if (count === 0) return (_child: PaperRef) => 0;

    const openChildIdSet = new Set(openChildIds);
    const focusedChildId =
      focusedNodeId && openChildIdSet.has(focusedNodeId) ? focusedNodeId : null;

    if (whenFocused !== undefined && focusedChildId !== null) {
      const focusedShare = Math.min(Math.max(whenFocused, 0), 1);
      const restShare = count > 1 ? (1 - focusedShare) / (count - 1) : 0;
      return (child: PaperRef) =>
        openChildIdSet.has(child.id)
          ? (child.id === focusedChildId ? focusedShare : restShare)
          : 0;
    }

    const equal = 1 / count;
    return (child: PaperRef) => (openChildIdSet.has(child.id) ? equal : 0);
  }, [openChildIds, focusedNodeId, whenFocused]);

  return { shareOf };
}
