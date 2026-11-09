import type { Paper, PaperId, PaperMap } from './types';

export function buildPaperMap(papers: Paper[]): PaperMap {
  return new Map(papers.map((p) => [p.id, p]));
}

/**
 * The first parentless paper that is not waiting in the unplaced list, or null when there is
 * none (an empty map, for instance).
 */
export function findRootId(
  paperMap: PaperMap,
  unplacedNodeIds: readonly PaperId[] = [],
): PaperId | null {
  const unplaced = unplacedNodeIds.length > 0 ? new Set(unplacedNodeIds) : null;
  for (const paper of paperMap.values()) {
    if (paper.parentId === null && !unplaced?.has(paper.id)) return paper.id;
  }
  return null;
}

/**
 * Every paper below `nodeId` (not including it). Safe on malformed maps: a paper reached twice
 * (a cycle, or a child listed by two parents) is visited once.
 */
export function getDescendantIds(paperMap: PaperMap, nodeId: PaperId): PaperId[] {
  const result: PaperId[] = [];
  const seen = new Set<PaperId>([nodeId]);
  const stack = [nodeId];
  while (stack.length > 0) {
    const node = paperMap.get(stack.pop()!);
    if (!node) continue;
    for (const childId of node.childIds) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      result.push(childId);
      stack.push(childId);
    }
  }
  return result;
}

/**
 * True when `ancestorId` is `nodeId` itself or sits above it in the parent chain. Walks
 * `parentId` links with a guard, so a cycle answers false instead of hanging.
 */
export function isSelfOrAncestor(paperMap: PaperMap, ancestorId: PaperId, nodeId: PaperId): boolean {
  const seen = new Set<PaperId>();
  let current: PaperId | null = nodeId;
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = paperMap.get(current)?.parentId ?? null;
  }
  return false;
}

/**
 * The ids from the root down to `nodeId`'s parent, or null when the chain is broken (a missing
 * paper) or loops.
 */
export function getAncestorIds(paperMap: PaperMap, nodeId: PaperId): PaperId[] | null {
  const node = paperMap.get(nodeId);
  if (!node) return null;
  const chain: PaperId[] = [];
  const seen = new Set<PaperId>([nodeId]);
  let parentId = node.parentId;
  while (parentId !== null) {
    if (seen.has(parentId)) return null;
    const parent = paperMap.get(parentId);
    if (!parent) return null;
    seen.add(parentId);
    chain.push(parentId);
    parentId = parent.parentId;
  }
  return chain.reverse();
}

/** `list` with `id` inserted before `insertBeforeId` (at the end when that is null or absent). */
export function insertBefore(list: readonly PaperId[], id: PaperId, insertBeforeId: PaperId | null): PaperId[] {
  const without = list.filter((x) => x !== id);
  const index = insertBeforeId === null ? -1 : without.indexOf(insertBeforeId);
  if (index === -1) return [...without, id];
  return [...without.slice(0, index), id, ...without.slice(index)];
}

export function addChild(
  paperMap: PaperMap,
  parentId: PaperId,
  child: Paper,
  insertBeforeId: PaperId | null,
): PaperMap {
  const parent = paperMap.get(parentId);
  if (!parent || child.id === parentId) return paperMap;

  const next = new Map(paperMap);
  next.set(parentId, { ...parent, childIds: insertBefore(parent.childIds, child.id, insertBeforeId) });
  next.set(child.id, { ...child, parentId });
  return next;
}

export type RemoveMode = 'cascade' | 'lift';

/**
 * Removes `nodeId`. `cascade` removes its whole subtree; `lift` moves its children up into its
 * parent at its position (or makes them parentless when it had no parent).
 */
export function removeNode(paperMap: PaperMap, nodeId: PaperId, mode: RemoveMode = 'cascade'): PaperMap {
  const node = paperMap.get(nodeId);
  if (!node) return paperMap;

  const next = new Map(paperMap);

  if (mode === 'cascade') {
    for (const id of [nodeId, ...getDescendantIds(paperMap, nodeId)]) next.delete(id);
  } else {
    next.delete(nodeId);
    for (const childId of node.childIds) {
      const child = next.get(childId);
      if (child && child.parentId === nodeId) next.set(childId, { ...child, parentId: node.parentId });
    }
  }

  if (node.parentId !== null) {
    const parent = next.get(node.parentId);
    if (parent) {
      const lifted = mode === 'lift' ? node.childIds.filter((id) => next.has(id)) : [];
      const index = parent.childIds.indexOf(nodeId);
      const without = parent.childIds.filter((id) => id !== nodeId && !lifted.includes(id));
      const childIds = index === -1
        ? [...without, ...lifted]
        : [...without.slice(0, index), ...lifted, ...without.slice(index)];
      next.set(node.parentId, { ...parent, childIds });
    }
  }

  return next;
}

/**
 * Whether `nodeId` may be moved under `targetParentId`: both exist, the node is not a root,
 * and the target is not the node itself or one of its descendants (which would detach the
 * subtree into a cycle).
 */
export function canMoveNode(paperMap: PaperMap, nodeId: PaperId, targetParentId: PaperId): boolean {
  const node = paperMap.get(nodeId);
  if (!node || node.parentId === null) return false;
  if (!paperMap.has(targetParentId)) return false;
  return !isSelfOrAncestor(paperMap, nodeId, targetParentId);
}

/**
 * Moves `nodeId` under `targetParentId`, before `insertBeforeId` (at the end when null). The
 * same parent reorders. Returns the map unchanged when the move is not allowed.
 */
export function moveNode(
  paperMap: PaperMap,
  nodeId: PaperId,
  targetParentId: PaperId,
  insertBeforeId: PaperId | null,
): PaperMap {
  if (!canMoveNode(paperMap, nodeId, targetParentId)) return paperMap;
  const node = paperMap.get(nodeId)!;
  const sourceParentId = node.parentId!;
  if (insertBeforeId === nodeId) return paperMap;

  const next = new Map(paperMap);
  const sourceParent = next.get(sourceParentId);
  if (sourceParent && sourceParentId !== targetParentId) {
    next.set(sourceParentId, {
      ...sourceParent,
      childIds: sourceParent.childIds.filter((id) => id !== nodeId),
    });
  }

  const targetParent = next.get(targetParentId)!;
  const childIds = insertBefore(targetParent.childIds, nodeId, insertBeforeId);
  if (sourceParentId === targetParentId && sameOrder(childIds, targetParent.childIds)) return paperMap;
  next.set(targetParentId, { ...targetParent, childIds });
  if (node.parentId !== targetParentId) next.set(nodeId, { ...node, parentId: targetParentId });
  return next;
}

function sameOrder(a: readonly PaperId[], b: readonly PaperId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Problems with a paper map's tree structure, as readable sentences; empty when the map is a
 * well-formed tree. Unplaced papers count as extra roots only when not listed in
 * `unplacedNodeIds`. Useful as a development assertion for host data.
 */
export function checkTreeInvariants(
  paperMap: PaperMap,
  unplacedNodeIds: readonly PaperId[] = [],
): string[] {
  const problems: string[] = [];
  const unplaced = new Set(unplacedNodeIds);
  const roots: PaperId[] = [];

  for (const paper of paperMap.values()) {
    if (paper.parentId === null) {
      if (!unplaced.has(paper.id)) roots.push(paper.id);
    } else {
      const parent = paperMap.get(paper.parentId);
      if (!parent) {
        problems.push(`${paper.id}: parent ${paper.parentId} is missing`);
      } else if (!parent.childIds.includes(paper.id)) {
        problems.push(`${paper.id}: parent ${paper.parentId} does not list it as a child`);
      }
    }

    const seen = new Set<PaperId>();
    for (const childId of paper.childIds) {
      if (seen.has(childId)) problems.push(`${paper.id}: lists ${childId} twice`);
      seen.add(childId);
      const child = paperMap.get(childId);
      if (child && child.parentId !== paper.id) {
        problems.push(`${paper.id}: lists ${childId}, whose parent is ${child.parentId ?? 'none'}`);
      }
    }

    if (parentChainLoops(paperMap, paper.id)) problems.push(`${paper.id}: its parent chain loops`);
  }

  if (roots.length > 1) problems.push(`more than one root: ${roots.join(', ')}`);
  return problems;
}

function parentChainLoops(paperMap: PaperMap, nodeId: PaperId): boolean {
  const seen = new Set<PaperId>();
  let current: PaperId | null = nodeId;
  while (current !== null) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = paperMap.get(current)?.parentId ?? null;
  }
  return false;
}
