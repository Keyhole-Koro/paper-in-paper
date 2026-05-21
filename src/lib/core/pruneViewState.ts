import type { NodeExpansion, PaperId, PaperViewState } from './types';

/**
 * After paperMap is replaced wholesale (e.g. via __SYNC_PAPER_MAP), drop any
 * id that no longer exists in the new paperMap from each id-keyed view-state
 * collection. Without this, stale ids leak into expansionMap, focusedNodeId,
 * and other view state — they don't crash the UI (callers null-check), but
 * they keep "ghost" nodes in opened/protected/focused state forever.
 */

export function pruneIdKeyedMap<V>(map: Map<PaperId, V>, paperMap: PaperViewState['paperMap']): Map<PaperId, V> {
  let mutated = false;
  const next = new Map<PaperId, V>();
  for (const [id, value] of map) {
    if (paperMap.has(id)) next.set(id, value);
    else mutated = true;
  }
  return mutated ? next : map;
}

export function pruneIdSet(set: Set<PaperId>, paperMap: PaperViewState['paperMap']): Set<PaperId> {
  let mutated = false;
  const next = new Set<PaperId>();
  for (const id of set) {
    if (paperMap.has(id)) next.add(id);
    else mutated = true;
  }
  return mutated ? next : set;
}

export function pruneExpansionMap(
  expansionMap: PaperViewState['expansionMap'],
  paperMap: PaperViewState['paperMap'],
): PaperViewState['expansionMap'] {
  const next = new Map<PaperId, NodeExpansion>();
  let mutated = false;
  for (const [parentId, entry] of expansionMap) {
    if (!paperMap.has(parentId)) { mutated = true; continue; }
    const openChildIds = entry.openChildIds.filter((childId) => paperMap.has(childId));
    if (openChildIds.length === 0) { mutated = true; continue; }
    if (openChildIds.length === entry.openChildIds.length) {
      next.set(parentId, entry);
    } else {
      mutated = true;
      next.set(parentId, { openChildIds, openChildSet: new Set(openChildIds) });
    }
  }
  return mutated ? next : expansionMap;
}

export function pruneManualPlacementMap(
  manualPlacementMap: PaperViewState['manualPlacementMap'],
  paperMap: PaperViewState['paperMap'],
): PaperViewState['manualPlacementMap'] {
  let mutated = false;
  const next: PaperViewState['manualPlacementMap'] = new Map();
  for (const [parentId, placement] of manualPlacementMap) {
    if (!paperMap.has(parentId)) { mutated = true; continue; }
    const positions = pruneIdKeyedMap(placement.positions, paperMap);
    if (positions === placement.positions) {
      next.set(parentId, placement);
    } else {
      mutated = true;
      if (positions.size > 0) next.set(parentId, { positions });
    }
  }
  return mutated ? next : manualPlacementMap;
}
