import type { ExpansionMap, PaperId, PaperMap } from './types';
import { getDescendantIds } from './tree';

function makeEntry(openChildIds: PaperId[]): { openChildIds: PaperId[]; openChildSet: ReadonlySet<PaperId> } {
  return { openChildIds, openChildSet: new Set(openChildIds) };
}

export function openChild(
  expansionMap: ExpansionMap,
  parentId: PaperId,
  childId: PaperId,
): ExpansionMap {
  const current = expansionMap.get(parentId);
  if ((current?.openChildSet ?? new Set(current?.openChildIds ?? [])).has(childId)) return expansionMap;
  const openChildIds = current?.openChildIds ?? [];

  const next = new Map(expansionMap);
  next.set(parentId, makeEntry([...openChildIds, childId]));
  return next;
}

export function closeChild(
  expansionMap: ExpansionMap,
  paperMap: PaperMap,
  parentId: PaperId,
  childId: PaperId,
): ExpansionMap {
  const current = expansionMap.get(parentId);
  if (!current) return expansionMap;
  // If childId isn't actually open under parentId, and no descendants are
  // tracked in expansionMap, there is literally nothing to close. Returning
  // a fresh Map here would churn state.expansionMap identity for no reason
  // and feed useEffects that watch it.
  const wasOpen = current.openChildIds.includes(childId);
  const descendants = getDescendantIds(paperMap, childId);
  const hasDescendantEntries = descendants.some((id) => expansionMap.has(id)) || expansionMap.has(childId);
  if (!wasOpen && !hasDescendantEntries) return expansionMap;

  const next = new Map(expansionMap);
  if (wasOpen) {
    next.set(parentId, makeEntry(current.openChildIds.filter((id) => id !== childId)));
  }
  for (const id of [childId, ...descendants]) {
    next.delete(id);
  }

  return next;
}

export function removeNodeFromExpansion(
  expansionMap: ExpansionMap,
  paperMap: PaperMap,
  parentId: PaperId,
  nodeId: PaperId,
): ExpansionMap {
  const current = expansionMap.get(parentId);
  if (!current) return expansionMap;

  const next = new Map(expansionMap);
  next.set(parentId, makeEntry(current.openChildIds.filter((id) => id !== nodeId)));

  const descendants = getDescendantIds(paperMap, nodeId);
  for (const id of [nodeId, ...descendants]) {
    next.delete(id);
  }

  return next;
}

export function walkHiddenChain(
  fromId: PaperId,
  toId: PaperId,
  expansionMap: ExpansionMap,
): PaperId[] {
  const chain: PaperId[] = [];
  let cur = fromId;
  const visited = new Set([fromId]);
  while (true) {
    const openIds = expansionMap.get(cur)?.openChildIds ?? [];
    if (openIds.length !== 1) break;
    const next = openIds[0];
    if (visited.has(next) || next === toId) break;
    chain.push(next);
    visited.add(next);
    cur = next;
  }
  return chain;
}

const EMPTY_SET: ReadonlySet<PaperId> = new Set();

export function getOpenChildIds(expansionMap: ExpansionMap, parentId: PaperId): PaperId[] {
  return expansionMap.get(parentId)?.openChildIds ?? [];
}

export function getOpenChildSet(expansionMap: ExpansionMap, parentId: PaperId): ReadonlySet<PaperId> {
  const entry = expansionMap.get(parentId);
  return entry?.openChildSet ?? (entry ? new Set(entry.openChildIds) : EMPTY_SET);
}

export function isOpen(expansionMap: ExpansionMap, parentId: PaperId, childId: PaperId): boolean {
  return getOpenChildSet(expansionMap, parentId).has(childId);
}
