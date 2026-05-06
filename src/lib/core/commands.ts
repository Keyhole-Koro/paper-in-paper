import type { GridPosition, PaperContent, PaperId, PaperViewState, Paper } from './types';
import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { getAttentionSnapshot, resolveInitialAttention } from './attention';
import { openChild, closeChild, removeNodeFromExpansion } from './expansion';
import { deriveNodeVisibilityState, getNextNodeVisibilityState } from './nodeVisibility';
import { addChild, getDescendantIds, moveNode, removeNode, type RemoveMode } from './tree';
import { nanoid } from './nanoid';

export type Command =
  | { type: 'CREATE_UNPLACED_NODE'; title: string; description: string; content: PaperContent }
  | { type: 'CREATE_CHILD_NODE'; parentId: PaperId; title: string; description: string; content: PaperContent; hue?: number }
  | { type: 'DELETE_NODE'; nodeId: PaperId; mode?: RemoveMode }
  | { type: 'PATCH_NODE'; nodeId: PaperId; patch: Partial<Omit<Paper, 'id' | 'parentId' | 'childIds'>> }
  | { type: 'UPSERT_PAPERS'; papers: Paper[] }
  | { type: 'MERGE_PAPERS'; papers: Paper[] }
  | { type: 'OPEN_NODE'; parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE_NODE'; parentId: PaperId; childId: PaperId }
  | { type: 'FOCUS_NODE'; nodeId: PaperId }
  | { type: 'MOVE_NODE'; nodeId: PaperId; targetParentId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'REORDER_WITHIN_PARENT'; parentId: PaperId; paperId: PaperId; position: GridPosition }
  | { type: 'ATTACH_UNPLACED_NODE'; nodeId: PaperId; targetParentId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'REPORT_CONTENT_HEIGHT'; nodeId: PaperId; height: number }
  | { type: 'AUTO_CLOSE_NODE'; nodeId: PaperId }
  | { type: 'INDEX_CONTENT'; nodeId: PaperId }
  | { type: 'UNINDEX_CONTENT'; nodeId: PaperId }
  | { type: 'PIN_NODE'; nodeId: PaperId; minShare?: number }
  | { type: 'UNPIN_NODE'; nodeId: PaperId }
  | { type: 'LABEL_CLICK_BOOST'; nodeId: PaperId }
  | { type: '__SYNC_PAPER_MAP'; paperMap: PaperViewState['paperMap'] }
  | { type: '__SYNC_EXPANSION'; expansionMap: PaperViewState['expansionMap'] }
  | { type: '__SYNC_FOCUSED'; focusedNodeId: PaperViewState['focusedNodeId'] }
  | { type: '__SYNC_UNPLACED'; unplacedNodeIds: PaperViewState['unplacedNodeIds'] };

function upsertAttention(
  state: PaperViewState,
  nodeId: PaperId,
  delta: number,
  config: PaperCanvasConfig,
  now: number,
) {
  const attentionMap = new Map(state.attentionMap);
  const attentionTimestampMap = new Map(state.attentionTimestampMap);
  const current = getAttentionSnapshot(state, nodeId, config, now).value;
  attentionMap.set(nodeId, Math.max(0, current + delta));
  attentionTimestampMap.set(nodeId, now);
  return { attentionMap, attentionTimestampMap };
}

function syncAttentionForPaperMap(
  state: PaperViewState,
  nextPaperMap: PaperViewState['paperMap'],
  config: PaperCanvasConfig,
  now: number,
) {
  const attentionMap = new Map<PaperId, number>();
  const attentionTimestampMap = new Map<PaperId, number>();

  for (const [id, paper] of nextPaperMap) {
    const hasExternalAttention = paper.attentionScore !== undefined;
    if (hasExternalAttention) {
      attentionMap.set(id, resolveInitialAttention(paper, config));
      attentionTimestampMap.set(id, now);
      continue;
    }

    const existing = state.attentionMap.get(id);
    attentionMap.set(id, existing ?? resolveInitialAttention(paper, config));
    attentionTimestampMap.set(id, state.attentionTimestampMap.get(id) ?? now);
  }

  return { attentionMap, attentionTimestampMap };
}

function clearPinOnNode(paperMap: PaperViewState['paperMap'], nodeId: PaperId) {
  const node = paperMap.get(nodeId);
  if (!node || node.pinnedLayout === undefined) return paperMap;
  const next = new Map(paperMap);
  next.set(nodeId, { ...node, pinnedLayout: undefined });
  return next;
}

function addIndexedContent(indexedContentIds: Set<PaperId>, nodeId: PaperId) {
  const next = new Set(indexedContentIds);
  next.add(nodeId);
  return next;
}

function removeIndexedContent(indexedContentIds: Set<PaperId>, nodeId: PaperId) {
  const next = new Set(indexedContentIds);
  next.delete(nodeId);
  return next;
}

function reduceCore(state: PaperViewState, command: Command, config: PaperCanvasConfig): PaperViewState {
  switch (command.type) {
    case 'CREATE_UNPLACED_NODE': {
      const id = nanoid();
      const now = Date.now();
      const next = new Map(state.paperMap);
      next.set(id, {
        id,
        title: command.title,
        description: command.description,
        content: command.content,
        parentId: null,
        childIds: [],
      });
      const attentionMap = new Map(state.attentionMap);
      attentionMap.set(id, config.attention.initial);
      const attentionTimestampMap = new Map(state.attentionTimestampMap);
      attentionTimestampMap.set(id, now);
      const accessMap = new Map(state.accessMap);
      accessMap.set(id, now);
      return {
        ...state,
        paperMap: next,
        unplacedNodeIds: [...state.unplacedNodeIds, id],
        attentionMap,
        attentionTimestampMap,
        accessMap,
      };
    }

    case 'CREATE_CHILD_NODE': {
      const id = nanoid();
      const now = Date.now();
      const next = new Map(state.paperMap);
      const parent = next.get(command.parentId);
      if (!parent) return state;
      next.set(id, {
        id,
        title: command.title,
        description: command.description,
        content: command.content,
        hue: command.hue,
        parentId: command.parentId,
        childIds: [],
      });
      next.set(command.parentId, { ...parent, childIds: [...parent.childIds, id] });
      const expansionMap = openChild(state.expansionMap, command.parentId, id);
      const attentionMap = new Map(state.attentionMap);
      attentionMap.set(id, config.attention.initial);
      const attentionTimestampMap = new Map(state.attentionTimestampMap);
      attentionTimestampMap.set(id, now);
      const accessMap = new Map(state.accessMap);
      accessMap.set(id, now);
      const protectedUntilMap = new Map(state.protectedUntilMap);
      protectedUntilMap.set(id, now + config.attention.protectDurationMs);
      return {
        ...state,
        paperMap: next,
        expansionMap,
        attentionMap,
        attentionTimestampMap,
        accessMap,
        protectedUntilMap,
        focusedNodeId: id,
      };
    }

    case 'PATCH_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node) return state;
      const paperMap = new Map(state.paperMap);
      paperMap.set(command.nodeId, { ...node, ...command.patch });

      let nextState: PaperViewState = { ...state, paperMap };
      if (command.patch.attentionScore !== undefined) {
        const now = Date.now();
        const attentionMap = new Map(state.attentionMap);
        const attentionTimestampMap = new Map(state.attentionTimestampMap);
        attentionMap.set(command.nodeId, command.patch.attentionScore ?? config.attention.initial);
        attentionTimestampMap.set(command.nodeId, now);
        nextState = { ...nextState, attentionMap, attentionTimestampMap };
      }
      return nextState;
    }

    case 'UPSERT_PAPERS': {
      const paperMap = new Map(state.paperMap);
      const accessMap = new Map(state.accessMap);
      const now = Date.now();
      for (const paper of command.papers) {
        const isNew = !paperMap.has(paper.id);
        paperMap.set(paper.id, paper);
        if (isNew) {
          accessMap.set(paper.id, now);
        }
      }
      const { attentionMap, attentionTimestampMap } = syncAttentionForPaperMap(state, paperMap, config, now);
      return { ...state, paperMap, attentionMap, attentionTimestampMap, accessMap };
    }

    case 'MERGE_PAPERS': {
      const paperMap = new Map(state.paperMap);
      const accessMap = new Map(state.accessMap);
      const now = Date.now();
      for (const paper of command.papers) {
        const existing = paperMap.get(paper.id);
        if (existing) {
          paperMap.set(paper.id, {
            ...existing,
            ...paper,
            childIds: Array.from(new Set([...existing.childIds, ...paper.childIds])),
            parentId: paper.parentId ?? existing.parentId,
          });
        } else {
          paperMap.set(paper.id, paper);
          accessMap.set(paper.id, now);
        }
      }
      const { attentionMap, attentionTimestampMap } = syncAttentionForPaperMap(state, paperMap, config, now);
      return { ...state, paperMap, attentionMap, attentionTimestampMap, accessMap };
    }

    case 'DELETE_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.parentId === null) return state;
      const removedIds = new Set([command.nodeId, ...getDescendantIds(state.paperMap, command.nodeId)]);

      const paperMap = removeNode(state.paperMap, command.nodeId, command.mode ?? 'cascade');
      let expansionMap = new Map(state.expansionMap);
      expansionMap = removeNodeFromExpansion(
        expansionMap,
        state.paperMap,
        node.parentId,
        command.nodeId,
      );

      const attentionMap = new Map(state.attentionMap);
      const attentionTimestampMap = new Map(state.attentionTimestampMap);
      const accessMap = new Map(state.accessMap);
      for (const removedId of removedIds) {
        attentionMap.delete(removedId);
        attentionTimestampMap.delete(removedId);
        accessMap.delete(removedId);
      }

      const indexedContentIds = new Set(state.indexedContentIds);
      for (const removedId of removedIds) {
        indexedContentIds.delete(removedId);
      }

      return {
        ...state,
        paperMap,
        expansionMap,
        attentionMap,
        attentionTimestampMap,
        accessMap,
        indexedContentIds,
        focusedNodeId:
          state.focusedNodeId === command.nodeId ? node.parentId : state.focusedNodeId,
      };
    }

    case 'OPEN_NODE': {
      const now = Date.now();
      const expansionMap = openChild(state.expansionMap, command.parentId, command.childId);
      const currentVisibility = deriveNodeVisibilityState(command.childId, state);
      const nextVisibility = getNextNodeVisibilityState(currentVisibility, 'OPEN_NODE');
      const indexedContentIds =
        nextVisibility === 'expanded'
          ? removeIndexedContent(state.indexedContentIds, command.childId)
          : state.indexedContentIds;
      const { attentionMap, attentionTimestampMap } = upsertAttention(
        state,
        command.childId,
        config.attention.openBonus,
        config,
        now,
      );
      const accessMap = new Map(state.accessMap);
      accessMap.set(command.childId, now);
      const protectedUntilMap = new Map(state.protectedUntilMap);
      protectedUntilMap.set(command.childId, now + config.attention.protectDurationMs);
      return {
        ...state,
        expansionMap,
        indexedContentIds,
        attentionMap,
        attentionTimestampMap,
        accessMap,
        protectedUntilMap,
        focusedNodeId: command.childId,
      };
    }

    case 'CLOSE_NODE': {
      const expansionMap = closeChild(
        state.expansionMap,
        state.paperMap,
        command.parentId,
        command.childId,
      );
      return { ...state, expansionMap };
    }

    case 'FOCUS_NODE': {
      const now = Date.now();
      const { attentionMap, attentionTimestampMap } = upsertAttention(
        state,
        command.nodeId,
        config.attention.focusBonus,
        config,
        now,
      );
      const accessMap = new Map(state.accessMap);
      accessMap.set(command.nodeId, now);
      return { ...state, attentionMap, attentionTimestampMap, accessMap, focusedNodeId: command.nodeId };
    }

    case 'LABEL_CLICK_BOOST': {
      const now = Date.now();
      const { attentionMap, attentionTimestampMap } = upsertAttention(
        state,
        command.nodeId,
        config.attention.labelClickBoost,
        config,
        now,
      );
      const accessMap = new Map(state.accessMap);
      accessMap.set(command.nodeId, now);
      return { ...state, attentionMap, attentionTimestampMap, accessMap };
    }

    case 'MOVE_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.parentId === null) return state;

      let paperMap = moveNode(
        state.paperMap,
        command.nodeId,
        command.targetParentId,
        command.insertBeforeId,
      );
      if (node.parentId !== command.targetParentId) {
        paperMap = clearPinOnNode(paperMap, command.nodeId);
      }

      const expansionMap = removeNodeFromExpansion(
        state.expansionMap,
        state.paperMap,
        node.parentId,
        command.nodeId,
      );
      const next = openChild(expansionMap, command.targetParentId, command.nodeId);

      return {
        ...state,
        paperMap,
        expansionMap: next,
        focusedNodeId: command.nodeId,
      };
    }

    case 'REORDER_WITHIN_PARENT': {
      const manualPlacementMap = new Map(state.manualPlacementMap);
      const existing = manualPlacementMap.get(command.parentId);
      const positions = new Map(existing?.positions ?? []);
      positions.set(command.paperId, command.position);
      manualPlacementMap.set(command.parentId, { positions });
      return { ...state, manualPlacementMap };
    }

    case 'ATTACH_UNPLACED_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node) return state;

      let paperMap = addChild(
        state.paperMap,
        command.targetParentId,
        node,
        command.insertBeforeId,
      );
      paperMap = clearPinOnNode(paperMap, command.nodeId);
      const expansionMap = openChild(state.expansionMap, command.targetParentId, command.nodeId);

      return {
        ...state,
        paperMap,
        expansionMap,
        unplacedNodeIds: state.unplacedNodeIds.filter((id) => id !== command.nodeId),
        focusedNodeId: command.nodeId,
      };
    }

    case 'REPORT_CONTENT_HEIGHT': {
      const prev = state.contentHeightMap.get(command.nodeId);
      if (prev !== undefined && Math.abs(prev - command.height) / prev < 0.1) return state;
      const contentHeightMap = new Map(state.contentHeightMap);
      contentHeightMap.set(command.nodeId, command.height);
      return { ...state, contentHeightMap };
    }

    case 'AUTO_CLOSE_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.parentId === null) return state;
      const expansionMap = closeChild(
        state.expansionMap,
        state.paperMap,
        node.parentId,
        command.nodeId,
      );
      return { ...state, expansionMap };
    }

    case 'INDEX_CONTENT': {
      const currentVisibility = deriveNodeVisibilityState(command.nodeId, state);
      const nextVisibility = getNextNodeVisibilityState(currentVisibility, 'INDEX_CONTENT');
      if (nextVisibility === currentVisibility) return state;
      const indexedContentIds = addIndexedContent(state.indexedContentIds, command.nodeId);
      return { ...state, indexedContentIds };
    }

    case 'UNINDEX_CONTENT': {
      const currentVisibility = deriveNodeVisibilityState(command.nodeId, state);
      const nextVisibility = getNextNodeVisibilityState(currentVisibility, 'UNINDEX_CONTENT');
      if (nextVisibility === currentVisibility) {
        const indexedContentIds = removeIndexedContent(state.indexedContentIds, command.nodeId);
        if (indexedContentIds.size === state.indexedContentIds.size) return state;
        return { ...state, indexedContentIds };
      }
      const indexedContentIds = removeIndexedContent(state.indexedContentIds, command.nodeId);
      return { ...state, indexedContentIds };
    }

    case 'PIN_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node) return state;
      const paperMap = new Map(state.paperMap);
      paperMap.set(command.nodeId, {
        ...node,
        pinnedLayout: {
          minShare: command.minShare ?? node.pinnedLayout?.minShare,
          pinnedAt: Date.now(),
        },
      });
      return { ...state, paperMap };
    }

    case 'UNPIN_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.pinnedLayout === undefined) return state;
      const paperMap = new Map(state.paperMap);
      paperMap.set(command.nodeId, { ...node, pinnedLayout: undefined });
      return { ...state, paperMap };
    }

    case '__SYNC_PAPER_MAP': {
      if (command.paperMap === state.paperMap) return state;
      const now = Date.now();
      const { attentionMap, attentionTimestampMap } = syncAttentionForPaperMap(state, command.paperMap, config, now);
      return { ...state, paperMap: command.paperMap, attentionMap, attentionTimestampMap };
    }

    case '__SYNC_EXPANSION': {
      if (command.expansionMap === state.expansionMap) return state;
      const protectedUntilMap = new Map(state.protectedUntilMap);
      const now = Date.now();
      for (const [parentId, entry] of command.expansionMap) {
        const prevEntry = state.expansionMap.get(parentId);
        const prevOpen = new Set(prevEntry?.openChildIds ?? []);
        for (const childId of entry.openChildIds) {
          if (!prevOpen.has(childId)) {
            protectedUntilMap.set(childId, now + config.attention.protectDurationMs);
          }
        }
      }
      return { ...state, expansionMap: command.expansionMap, protectedUntilMap };
    }

    case '__SYNC_FOCUSED': {
      if (command.focusedNodeId === state.focusedNodeId) return state;
      return { ...state, focusedNodeId: command.focusedNodeId };
    }

    case '__SYNC_UNPLACED': {
      if (command.unplacedNodeIds === state.unplacedNodeIds) return state;
      return { ...state, unplacedNodeIds: command.unplacedNodeIds };
    }

    default:
      return state;
  }
}

export function reduce(state: PaperViewState, command: Command, config: PaperCanvasConfig): PaperViewState {
  return reduceCore(state, command, config);
}

export function createInitialState(
  paperMap: PaperViewState['paperMap'],
  config: PaperCanvasConfig,
  unplacedNodeIds: PaperViewState['unplacedNodeIds'] = [],
): PaperViewState {
  const attentionMap = new Map<string, number>();
  const attentionTimestampMap = new Map<string, number>();
  const now = Date.now();
  for (const [id, paper] of paperMap) {
    attentionMap.set(id, resolveInitialAttention(paper, config));
    attentionTimestampMap.set(id, now);
  }
  const accessMap = new Map<string, number>();
  for (const id of paperMap.keys()) {
    accessMap.set(id, now);
  }
  return {
    paperMap,
    expansionMap: new Map(),
    indexedContentIds: new Set(),
    unplacedNodeIds,
    focusedNodeId: null,
    accessMap,
    attentionMap,
    attentionTimestampMap,
    manualPlacementMap: new Map(),
    contentHeightMap: new Map(),
    protectedUntilMap: new Map(),
  };
}
