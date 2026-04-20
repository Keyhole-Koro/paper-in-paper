import type { ExpansionMap, PaperId, PaperMap } from './types';
import { getDescendantIds } from './tree';

export function openChild(
  expansionMap: ExpansionMap,
  parentId: PaperId,
  childId: PaperId,
): ExpansionMap {
  const current = expansionMap.get(parentId);
  const openChildIds = current?.openChildIds ?? [];
  if (openChildIds.includes(childId)) return expansionMap;

  const next = new Map(expansionMap);
  next.set(parentId, { openChildIds: [...openChildIds, childId] });
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

  const next = new Map(expansionMap);
  next.set(parentId, {
    openChildIds: current.openChildIds.filter((id) => id !== childId),
  });

  // clear subtree expansion
  const descendants = getDescendantIds(paperMap, childId);
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
  next.set(parentId, {
    openChildIds: current.openChildIds.filter((id) => id !== nodeId),
  });

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
  layoutMap: Map<PaperId, { hidden?: boolean }>,
): PaperId[] {
  const chain: PaperId[] = [];
  let cur = fromId;
  const visited = new Set([fromId]);
  while (true) {
    const openIds = expansionMap.get(cur)?.openChildIds ?? [];
    if (openIds.length !== 1) break;
    const next = openIds[0];
    if (visited.has(next) || next === toId) break;
    if (!layoutMap.get(next)?.hidden) break;
    chain.push(next);
    visited.add(next);
    cur = next;
  }
  return chain;
}

export function getOpenChildIds(expansionMap: ExpansionMap, parentId: PaperId): PaperId[] {
  return expansionMap.get(parentId)?.openChildIds ?? [];
}

export function isOpen(expansionMap: ExpansionMap, parentId: PaperId, childId: PaperId): boolean {
  return getOpenChildIds(expansionMap, parentId).includes(childId);
}
