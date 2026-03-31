import type { ExpansionMap, NodeExpansion, PaperId, PaperMap } from './types';

export type ExpansionAction =
  | { type: 'OPEN'; parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE'; paperId: PaperId; parentId: PaperId }
  | { type: 'SET_PRIMARY'; parentId: PaperId; childId: PaperId };

export function openNode(
  expansionMap: ExpansionMap,
  parentId: PaperId,
  childId: PaperId,
): ExpansionMap {
  const next = new Map(expansionMap);
  const current = next.get(parentId) ?? emptyExpansion();
  const alreadyOpen = current.openChildIds.includes(childId);

  next.set(parentId, {
    openChildIds: alreadyOpen ? current.openChildIds : [...current.openChildIds, childId],
    primaryChildId: childId,
  });

  return next;
}

export function closeNode(
  expansionMap: ExpansionMap,
  paperMap: PaperMap,
  parentId: PaperId,
  paperId: PaperId,
): ExpansionMap {
  const next = new Map(expansionMap);
  const current = next.get(parentId);

  if (!current) {
    return expansionMap;
  }

  const openChildIds = current.openChildIds.filter((id) => id !== paperId);
  const primaryChildId =
    current.primaryChildId === paperId ? (openChildIds.at(-1) ?? null) : current.primaryChildId;

  next.set(parentId, { openChildIds, primaryChildId });
  clearSubtree(next, paperId, paperMap);

  return next;
}

export function setPrimaryNode(
  expansionMap: ExpansionMap,
  parentId: PaperId,
  childId: PaperId,
): ExpansionMap {
  const next = new Map(expansionMap);
  const current = next.get(parentId) ?? emptyExpansion();

  next.set(parentId, { ...current, primaryChildId: childId });
  return next;
}

export function expansionReducer(
  expansionMap: ExpansionMap,
  paperMap: PaperMap,
  action: ExpansionAction,
): ExpansionMap {
  switch (action.type) {
    case 'OPEN':
      return openNode(expansionMap, action.parentId, action.childId);
    case 'CLOSE':
      return closeNode(expansionMap, paperMap, action.parentId, action.paperId);
    case 'SET_PRIMARY':
      return setPrimaryNode(expansionMap, action.parentId, action.childId);
    default:
      return expansionMap;
  }
}

function clearSubtree(expansionMap: ExpansionMap, paperId: PaperId, paperMap: PaperMap) {
  const expansion = expansionMap.get(paperId);

  if (!expansion) {
    return;
  }

  expansion.openChildIds.forEach((childId) => clearSubtree(expansionMap, childId, paperMap));
  expansionMap.delete(paperId);
}

function emptyExpansion(): NodeExpansion {
  return { openChildIds: [], primaryChildId: null };
}
