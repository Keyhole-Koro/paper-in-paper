import type { Paper, PaperId, PaperMap } from './types';

export function buildPaperMap(papers: Paper[]): PaperMap {
  return new Map(papers.map((p) => [p.id, p]));
}

export function getRootId(paperMap: PaperMap): PaperId {
  for (const paper of paperMap.values()) {
    if (paper.parentId === null) return paper.id;
  }
  throw new Error('No root node found');
}

export function getDescendantIds(paperMap: PaperMap, nodeId: PaperId): PaperId[] {
  const result: PaperId[] = [];
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    const node = paperMap.get(id);
    if (!node) continue;
    for (const childId of node.childIds) {
      result.push(childId);
      stack.push(childId);
    }
  }
  return result;
}

export function addChild(
  paperMap: PaperMap,
  parentId: PaperId,
  child: Paper,
  insertBeforeId: PaperId | null,
): PaperMap {
  const parent = paperMap.get(parentId);
  if (!parent) return paperMap;

  const newChildIds =
    insertBeforeId === null
      ? [...parent.childIds, child.id]
      : (() => {
          const idx = parent.childIds.indexOf(insertBeforeId);
          const arr = [...parent.childIds];
          arr.splice(idx === -1 ? arr.length : idx, 0, child.id);
          return arr;
        })();

  const next = new Map(paperMap);
  next.set(parentId, { ...parent, childIds: newChildIds });
  next.set(child.id, { ...child, parentId });
  return next;
}

export type RemoveMode = 'cascade' | 'lift';

export function removeNode(paperMap: PaperMap, nodeId: PaperId, mode: RemoveMode = 'cascade'): PaperMap {
  const node = paperMap.get(nodeId);
  if (!node) return paperMap;

  const next = new Map(paperMap);

  if (mode === 'cascade') {
    const descendants = getDescendantIds(paperMap, nodeId);
    for (const id of [nodeId, ...descendants]) next.delete(id);
  } else {
    // lift: promote children to parent
    next.delete(nodeId);
    if (node.parentId !== null) {
      for (const childId of node.childIds) {
        const child = next.get(childId);
        if (child) next.set(childId, { ...child, parentId: node.parentId });
      }
    }
  }

  if (node.parentId !== null) {
    const parent = next.get(node.parentId);
    if (parent) {
      const newChildIds = mode === 'lift'
        ? (() => {
            const arr = [...parent.childIds];
            const idx = arr.indexOf(nodeId);
            arr.splice(idx === -1 ? arr.length : idx, 1, ...node.childIds);
            return arr;
          })()
        : parent.childIds.filter((id) => id !== nodeId);
      next.set(node.parentId, { ...parent, childIds: newChildIds });
    }
  }

  return next;
}

export function moveNode(
  paperMap: PaperMap,
  nodeId: PaperId,
  targetParentId: PaperId,
  insertBeforeId: PaperId | null,
): PaperMap {
  const node = paperMap.get(nodeId);
  if (!node || node.parentId === null) return paperMap;

  const sourceParentId = node.parentId;
  let next = new Map(paperMap);

  // remove from source parent
  const sourceParent = next.get(sourceParentId);
  if (sourceParent) {
    next.set(sourceParentId, {
      ...sourceParent,
      childIds: sourceParent.childIds.filter((id) => id !== nodeId),
    });
  }

  // add to target parent
  const targetParent = next.get(targetParentId);
  if (!targetParent) return paperMap;

  const newChildIds =
    insertBeforeId === null
      ? [...targetParent.childIds, nodeId]
      : (() => {
          const idx = targetParent.childIds.indexOf(insertBeforeId);
          const arr = [...targetParent.childIds];
          arr.splice(idx === -1 ? arr.length : idx, 0, nodeId);
          return arr;
        })();

  next.set(targetParentId, { ...targetParent, childIds: newChildIds });
  next.set(nodeId, { ...node, parentId: targetParentId });

  return next;
}
