import type { PaperId } from '../../core/types';
import type { PaperStore } from '../store/createPaperStore';

/**
 * Follows a `data-paper-id` link inside paper `fromId`. A child opens inside the paper; any
 * other known paper (an ancestor, a sibling, a cousin) is revealed where it lives in the tree;
 * unknown ids are ignored. Content can therefore link anywhere without breaking the tree.
 */
export function openPaperLink(store: PaperStore, fromId: PaperId, targetId: PaperId): void {
  const target = store.getState().paperMap.get(targetId);
  if (!target) return;
  if (target.parentId === fromId) {
    store.dispatch({ type: 'OPEN_NODE', parentId: fromId, childId: targetId });
  } else {
    store.dispatch({ type: 'REVEAL_NODE', nodeId: targetId });
  }
}
