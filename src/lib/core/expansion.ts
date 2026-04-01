import type { ExpansionMap, NodeExpansion, PaperId, PaperMap } from './types';
import { debugLog } from '../react/internal/drag/debugLog';

export type ExpansionAction =
  | { type: 'OPEN'; parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE'; childId: PaperId; parentId: PaperId }
  | { type: 'SET_PRIMARY'; parentId: PaperId; childId: PaperId }
  | { type: 'REORDER'; parentId: PaperId; childId: PaperId; insertBeforeId: PaperId | null };

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
  childId: PaperId,
): ExpansionMap {
  const next = new Map(expansionMap);
  const current = next.get(parentId);

  if (!current) {
    return expansionMap;
  }

  const openChildIds = current.openChildIds.filter((id) => id !== childId);
  const primaryChildId =
    current.primaryChildId === childId ? (openChildIds.at(-1) ?? null) : current.primaryChildId;

  next.set(parentId, { openChildIds, primaryChildId });
  clearSubtree(next, childId, paperMap);

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

export function reorderNode(
  expansionMap: ExpansionMap,
  paperMap: PaperMap,
  parentId: PaperId,
  childId: PaperId,
  insertBeforeId: PaperId | null,
): { expansionMap: ExpansionMap; paperMap: PaperMap } {
  const node = paperMap.get(childId);
  const targetParent = paperMap.get(parentId);
  if (!node || !targetParent) {
    return { expansionMap, paperMap };
  }

  const sourceParentId = node.parentId;
  const nextPaperMap = new Map(paperMap);
  const nextExpansionMap = new Map(expansionMap);

  if (sourceParentId !== null) {
    const sourceParent = nextPaperMap.get(sourceParentId);
    if (sourceParent) {
      nextPaperMap.set(sourceParentId, {
        ...sourceParent,
        childIds: sourceParent.childIds.filter((id) => id !== childId),
      });
    }

    const sourceExpansion = nextExpansionMap.get(sourceParentId);
    if (sourceExpansion) {
      const openChildIds = sourceExpansion.openChildIds.filter((id) => id !== childId);
      const primaryChildId =
        sourceExpansion.primaryChildId === childId ? (openChildIds.at(-1) ?? null) : sourceExpansion.primaryChildId;
      nextExpansionMap.set(sourceParentId, { openChildIds, primaryChildId });
    }
  }

  const targetChildIds = [...(nextPaperMap.get(parentId)?.childIds ?? targetParent.childIds)].filter((id) => id !== childId);
  const insertIdx = insertBeforeId === null ? targetChildIds.length : targetChildIds.indexOf(insertBeforeId);
  targetChildIds.splice(insertIdx === -1 ? targetChildIds.length : insertIdx, 0, childId);
  nextPaperMap.set(parentId, {
    ...(nextPaperMap.get(parentId) ?? targetParent),
    childIds: targetChildIds,
  });
  nextPaperMap.set(childId, { ...node, parentId });

  const targetExpansion = nextExpansionMap.get(parentId);
  if (targetExpansion) {
    const openIds = targetExpansion.openChildIds.filter((id) => id !== childId);
    const openInsertIdx = insertBeforeId === null
      ? openIds.length
      : openIds.indexOf(insertBeforeId);
    openIds.splice(openInsertIdx === -1 ? openIds.length : openInsertIdx, 0, childId);
    nextExpansionMap.set(parentId, { ...targetExpansion, openChildIds: openIds, primaryChildId: childId });
  }

  return { expansionMap: nextExpansionMap, paperMap: nextPaperMap };
}

export function expansionReducer(
  state: { expansionMap: ExpansionMap; paperMap: PaperMap },
  action: ExpansionAction,
): { expansionMap: ExpansionMap; paperMap: PaperMap } {
  const { expansionMap, paperMap } = state;
  debugLog('expansion-action', {
    type: action.type,
    action,
    expansionKeys: [...expansionMap.keys()],
  });
  switch (action.type) {
    case 'OPEN':
      return { ...state, expansionMap: openNode(expansionMap, action.parentId, action.childId) };
    case 'CLOSE':
      return { ...state, expansionMap: closeNode(expansionMap, paperMap, action.parentId, action.childId) };
    case 'SET_PRIMARY':
      return { ...state, expansionMap: setPrimaryNode(expansionMap, action.parentId, action.childId) };
    case 'REORDER':
      return reorderNode(expansionMap, paperMap, action.parentId, action.childId, action.insertBeforeId);
    default:
      return state;
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
