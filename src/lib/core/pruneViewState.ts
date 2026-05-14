import type { NodeExpansion, PaperId, PaperViewState } from './types';

/**
 * After paperMap is replaced wholesale (e.g. via __SYNC_PAPER_MAP), drop any
 * id that no longer exists in the new paperMap from each id-keyed view-state
 * collection. Without this, stale ids leak into expansionMap, focusedNodeId,
 * and other view state — they don't crash the UI (callers null-check), but
 * they keep "ghost" nodes in opened/protected/focused state forever.
 */

export function pruneIdKeyedMap<V>(map: Map<PaperId, V>, paperMap: PaperViewState['paperMap']): Map<PaperId, V> {
  const next = new Map<PaperId, V>();
  for (const [id, value] of map) {
    if (paperMap.has(id)) next.set(id, value);
  }
  return next;
}

export function pruneIdSet(set: Set<PaperId>, paperMap: PaperViewState['paperMap']): Set<PaperId> {
  const next = new Set<PaperId>();
  for (const id of set) {
    if (paperMap.has(id)) next.add(id);
  }
  return next;
}

export function pruneExpansionMap(
  expansionMap: PaperViewState['expansionMap'],
  paperMap: PaperViewState['paperMap'],
): PaperViewState['expansionMap'] {
  const next = new Map<PaperId, NodeExpansion>();
  for (const [parentId, entry] of expansionMap) {
    if (!paperMap.has(parentId)) continue;
    const openChildIds = entry.openChildIds.filter((childId) => paperMap.has(childId));
    if (openChildIds.length === 0) continue;
    next.set(parentId, { ...entry, openChildIds });
  }
  return next;
}

export function pruneManualPlacementMap(
  manualPlacementMap: PaperViewState['manualPlacementMap'],
  paperMap: PaperViewState['paperMap'],
): PaperViewState['manualPlacementMap'] {
  const next: PaperViewState['manualPlacementMap'] = new Map();
  for (const [parentId, placement] of manualPlacementMap) {
    if (!paperMap.has(parentId)) continue;
    const positions = pruneIdKeyedMap(placement.positions, paperMap);
    if (positions.size > 0) next.set(parentId, { positions });
  }
  return next;
}
