import type { ExpansionMap, NodeExpansion, PaperId, PaperMap } from './types';
import { getDescendantIds, insertBefore } from './tree';

const EMPTY_IDS: readonly PaperId[] = [];
const EMPTY_SET: ReadonlySet<PaperId> = new Set();

function makeEntry(openChildIds: PaperId[]): NodeExpansion {
  return { openChildIds, openChildSet: new Set(openChildIds) };
}

/**
 * A clean copy of an expansion map from outside (props, storage): entries get their lookup
 * set, ids are de-duplicated, malformed and empty entries are dropped. Ids are kept even when
 * no such paper exists yet, so restored state takes effect once the papers load.
 */
export function normalizeExpansionMap(input?: ExpansionMap | null): ExpansionMap {
  const next: ExpansionMap = new Map();
  if (!input) return next;
  for (const [parentId, entry] of input) {
    if (typeof parentId !== 'string' || !entry || !Array.isArray(entry.openChildIds)) continue;
    const ids: PaperId[] = [];
    const seen = new Set<PaperId>();
    for (const id of entry.openChildIds) {
      if (typeof id !== 'string' || seen.has(id) || id === parentId) continue;
      seen.add(id);
      ids.push(id);
    }
    if (ids.length === 0) continue;
    const set = entry.openChildSet;
    const reusable = ids.length === entry.openChildIds.length
      && set?.size === ids.length
      && ids.every((id) => set.has(id));
    next.set(parentId, reusable ? entry : makeEntry(ids));
  }
  return next;
}

export function getOpenChildIds(expansionMap: ExpansionMap, parentId: PaperId): readonly PaperId[] {
  return expansionMap.get(parentId)?.openChildIds ?? EMPTY_IDS;
}

export function getOpenChildSet(expansionMap: ExpansionMap, parentId: PaperId): ReadonlySet<PaperId> {
  const entry = expansionMap.get(parentId);
  return entry?.openChildSet ?? (entry ? new Set(entry.openChildIds) : EMPTY_SET);
}

export function isOpen(expansionMap: ExpansionMap, parentId: PaperId, childId: PaperId): boolean {
  return getOpenChildSet(expansionMap, parentId).has(childId);
}

/**
 * The open children of `parentId` that are really its children in `paperMap`, in layout order.
 * Layout and rendering only follow these edges, so restored or stale entries (a child that has
 * not loaded, has moved, or names an ancestor) can never render a paper twice or loop.
 */
export function getVisibleChildIds(
  paperMap: PaperMap,
  expansionMap: ExpansionMap,
  parentId: PaperId,
): PaperId[] {
  const open = getOpenChildIds(expansionMap, parentId);
  const visible: PaperId[] = [];
  for (const id of open) {
    if (paperMap.get(id)?.parentId === parentId) visible.push(id);
  }
  return visible;
}

/**
 * Opens `childId` under `parentId`, before `insertBeforeId` when given (at the end otherwise).
 * Re-opening an already open child only moves it when an insert position is given.
 */
export function openChild(
  expansionMap: ExpansionMap,
  parentId: PaperId,
  childId: PaperId,
  insertBeforeId?: PaperId | null,
): ExpansionMap {
  const current = expansionMap.get(parentId);
  const ids = current?.openChildIds ?? [];
  const alreadyOpen = getOpenChildSet(expansionMap, parentId).has(childId);
  if (alreadyOpen && insertBeforeId === undefined) return expansionMap;

  const nextIds = insertBefore(ids, childId, insertBeforeId ?? null);
  if (alreadyOpen && sameIds(nextIds, ids)) return expansionMap;
  const next = new Map(expansionMap);
  next.set(parentId, makeEntry(nextIds));
  return next;
}

/** Takes `childId` out of `parentId`'s open list only; the child's own subtree state is kept. */
export function detachChild(expansionMap: ExpansionMap, parentId: PaperId, childId: PaperId): ExpansionMap {
  const current = expansionMap.get(parentId);
  if (!current || !getOpenChildSet(expansionMap, parentId).has(childId)) return expansionMap;
  const next = new Map(expansionMap);
  const ids = current.openChildIds.filter((id) => id !== childId);
  if (ids.length === 0) next.delete(parentId);
  else next.set(parentId, makeEntry(ids));
  return next;
}

/**
 * Closes `childId` under `parentId` and forgets the open state of everything below it: a closed
 * paper reopens collapsed.
 */
export function closeChild(
  expansionMap: ExpansionMap,
  paperMap: PaperMap,
  parentId: PaperId,
  childId: PaperId,
): ExpansionMap {
  const below = [childId, ...getDescendantIds(paperMap, childId)].filter((id) => expansionMap.has(id));
  let next = detachChild(expansionMap, parentId, childId);
  if (below.length === 0) return next;
  if (next === expansionMap) next = new Map(expansionMap);
  for (const id of below) next.delete(id);
  return next;
}

/** Closes every open child of `parentId`. */
export function closeAllChildren(expansionMap: ExpansionMap, paperMap: PaperMap, parentId: PaperId): ExpansionMap {
  let next = expansionMap;
  for (const childId of getOpenChildIds(expansionMap, parentId)) {
    next = closeChild(next, paperMap, parentId, childId);
  }
  return next;
}

/** Removes `removedIds` from the map, both as parents and as open children. */
export function pruneExpansionIds(expansionMap: ExpansionMap, removedIds: ReadonlySet<PaperId>): ExpansionMap {
  if (removedIds.size === 0) return expansionMap;
  let mutated = false;
  const next: ExpansionMap = new Map();
  for (const [parentId, entry] of expansionMap) {
    if (removedIds.has(parentId)) {
      mutated = true;
      continue;
    }
    const ids = entry.openChildIds.filter((id) => !removedIds.has(id));
    if (ids.length === entry.openChildIds.length) {
      next.set(parentId, entry);
    } else {
      mutated = true;
      if (ids.length > 0) next.set(parentId, makeEntry(ids));
    }
  }
  return mutated ? next : expansionMap;
}

export function expansionMapsEqual(a: ExpansionMap, b: ExpansionMap): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [parentId, entryA] of a) {
    const entryB = b.get(parentId);
    if (!entryB || !sameIds(entryA.openChildIds, entryB.openChildIds)) return false;
  }
  return true;
}

function sameIds(a: readonly PaperId[], b: readonly PaperId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
