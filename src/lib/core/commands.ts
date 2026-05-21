import type { GridPosition, PaperContent, PaperId, PaperViewState, Paper } from './types';
import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { resolveInitialAttention } from './attention';
import { openChild, closeChild, removeNodeFromExpansion } from './expansion';
import { deriveNodeVisibilityState, getNextNodeVisibilityState } from './nodeVisibility';
import { registerNode, syncAttentionForPaperMap, touchNode, unregisterNodes } from './nodeRegistry';
import {
  pruneExpansionMap,
  pruneIdKeyedMap,
  pruneIdSet,
  pruneManualPlacementMap,
} from './pruneViewState';
import { addChild, getDescendantIds, moveNode, removeNode, type RemoveMode } from './tree';
import { nanoid } from './nanoid';

export interface DefaultOpenState {
  expansionMap?: PaperViewState['expansionMap'];
  focusedNodeId?: PaperViewState['focusedNodeId'];
}

export type Command =
  | { type: 'CREATE_UNPLACED_NODE'; title: string; description: string; content: PaperContent }
  | { type: 'CREATE_CHILD_NODE'; parentId: PaperId; title: string; description: string; content: PaperContent; hue?: number }
  | { type: 'DELETE_NODE'; nodeId: PaperId; mode?: RemoveMode }
  | { type: 'PATCH_NODE'; nodeId: PaperId; patch: Partial<Omit<Paper, 'id' | 'parentId' | 'childIds'>> }
  | { type: 'UPSERT_PAPERS'; papers: Paper[] }
  | { type: 'MERGE_PAPERS'; papers: Paper[] }
  | { type: 'OPEN_NODE'; parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE_NODE'; parentId: PaperId; childId: PaperId }
  | { type: 'AUTO_CLOSE_NODE'; nodeId: PaperId }
  | { type: 'FOCUS_NODE'; nodeId: PaperId }
  | { type: 'MOVE_NODE'; nodeId: PaperId; targetParentId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'REORDER_WITHIN_PARENT'; parentId: PaperId; paperId: PaperId; position: GridPosition }
  | { type: 'ATTACH_UNPLACED_NODE'; nodeId: PaperId; targetParentId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'REPORT_CONTENT_HEIGHT'; nodeId: PaperId; height: number }
  | { type: 'INDEX_CONTENT'; nodeId: PaperId }
  | { type: 'UNINDEX_CONTENT'; nodeId: PaperId }
  | { type: 'PIN_NODE'; nodeId: PaperId; minShare?: number }
  | { type: 'UNPIN_NODE'; nodeId: PaperId }
  | { type: 'LABEL_CLICK_BOOST'; nodeId: PaperId }
  | { type: '__SYNC_PAPER_MAP'; paperMap: PaperViewState['paperMap'] }
  | {
      type: '__SYNC_OPEN_STATE';
      expansionMap?: PaperViewState['expansionMap'];
      focusedNodeId?: PaperViewState['focusedNodeId'];
    }
  | { type: '__SYNC_UNPLACED'; unplacedNodeIds: PaperViewState['unplacedNodeIds'] };

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
      const paperMap = new Map(state.paperMap);
      paperMap.set(id, {
        id,
        title: command.title,
        description: command.description,
        content: command.content,
        parentId: null,
        childIds: [],
      });
      return {
        ...state,
        paperMap,
        unplacedNodeIds: [...state.unplacedNodeIds, id],
        ...registerNode(state, id, config, now),
      };
    }

    case 'CREATE_CHILD_NODE': {
      const parent = state.paperMap.get(command.parentId);
      if (!parent) return state;
      const id = nanoid();
      const now = Date.now();
      const paperMap = new Map(state.paperMap);
      paperMap.set(id, {
        id,
        title: command.title,
        description: command.description,
        content: command.content,
        hue: command.hue,
        parentId: command.parentId,
        childIds: [],
      });
      paperMap.set(command.parentId, { ...parent, childIds: [...parent.childIds, id] });
      return {
        ...state,
        paperMap,
        expansionMap: openChild(state.expansionMap, command.parentId, id),
        ...registerNode(state, id, config, now, { protect: true }),
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

      return {
        ...state,
        paperMap: removeNode(state.paperMap, command.nodeId, command.mode ?? 'cascade'),
        expansionMap: removeNodeFromExpansion(
          state.expansionMap,
          state.paperMap,
          node.parentId,
          command.nodeId,
        ),
        ...unregisterNodes(state, removedIds),
        focusedNodeId:
          state.focusedNodeId === command.nodeId ? node.parentId : state.focusedNodeId,
      };
    }

    case 'OPEN_NODE': {
      const now = Date.now();
      const currentVisibility = deriveNodeVisibilityState(command.childId, state);
      const nextVisibility = getNextNodeVisibilityState(currentVisibility, 'OPEN_NODE');
      const indexedContentIds =
        nextVisibility === 'expanded'
          ? removeIndexedContent(state.indexedContentIds, command.childId)
          : state.indexedContentIds;
      return {
        ...state,
        expansionMap: openChild(state.expansionMap, command.parentId, command.childId),
        indexedContentIds,
        ...touchNode(state, command.childId, config.attention.openBonus, config, now, { protect: true }),
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

    case 'FOCUS_NODE': {
      return {
        ...state,
        ...touchNode(state, command.nodeId, config.attention.focusBonus, config, Date.now()),
        focusedNodeId: command.nodeId,
      };
    }

    case 'LABEL_CLICK_BOOST': {
      return {
        ...state,
        ...touchNode(state, command.nodeId, config.attention.labelClickBoost, config, Date.now()),
      };
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
      if (prev !== undefined) {
        // Two gates: relative (10%) AND absolute (12px). The relative gate
        // alone failed at the boundary — when computed-vs-applied height
        // diff is exactly 10%, the layout would update, resize, update,
        // resize... feedback-looping forever as long as the new room width
        // produced a slightly different content height than the previous
        // one. The absolute floor breaks that loop for normal-sized
        // content while still letting big content changes through.
        const relDelta = Math.abs(prev - command.height) / prev;
        const absDelta = Math.abs(prev - command.height);
        if (relDelta < 0.1 || absDelta < 12) return state;
      }
      const contentHeightMap = new Map(state.contentHeightMap);
      contentHeightMap.set(command.nodeId, command.height);
      return { ...state, contentHeightMap };
    }

    case 'INDEX_CONTENT': {
      const currentVisibility = deriveNodeVisibilityState(command.nodeId, state);
      const nextVisibility = getNextNodeVisibilityState(currentVisibility, 'INDEX_CONTENT');
      if (nextVisibility === currentVisibility) return state;
      const indexedContentIds = addIndexedContent(state.indexedContentIds, command.nodeId);
      return { ...state, indexedContentIds };
    }

    case 'UNINDEX_CONTENT': {
      if (!state.indexedContentIds.has(command.nodeId)) return state;
      // Without protection, the layout recompute that follows this unindex
      // immediately re-evaluates overflow and useOverflowAutoClose will pick
      // the same node again, leaving it indexed-looking from the user's view.
      // Shield it for protectDurationMs so the manual action takes effect.
      const indexedContentIds = removeIndexedContent(state.indexedContentIds, command.nodeId);
      const protectedUntilMap = new Map(state.protectedUntilMap);
      protectedUntilMap.set(command.nodeId, Date.now() + config.attention.protectDurationMs);
      return { ...state, indexedContentIds, protectedUntilMap };
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
      if (typeof window !== 'undefined' && (window as { __pipDebug?: boolean }).__pipDebug) {
        console.log('[pip-debug] __SYNC_PAPER_MAP fired', { size: command.paperMap.size });
      }
      const now = Date.now();
      const nextPaperMap = command.paperMap;
      const { attentionMap, attentionTimestampMap } = syncAttentionForPaperMap(state, nextPaperMap, config, now);

      const focusedNodeId =
        state.focusedNodeId !== null && !nextPaperMap.has(state.focusedNodeId)
          ? null
          : state.focusedNodeId;

      const expansionMap = pruneExpansionMap(state.expansionMap, nextPaperMap);
      const accessMap = pruneIdKeyedMap(state.accessMap, nextPaperMap);
      const indexedContentIds = pruneIdSet(state.indexedContentIds, nextPaperMap);
      const protectedUntilMap = pruneIdKeyedMap(state.protectedUntilMap, nextPaperMap);
      const contentHeightMap = pruneIdKeyedMap(state.contentHeightMap, nextPaperMap);
      const manualPlacementMap = pruneManualPlacementMap(state.manualPlacementMap, nextPaperMap);

      // If nothing actually changed except the paperMap reference identity,
      // keep the prior state object so downstream useEffects don't echo.
      if (
        focusedNodeId === state.focusedNodeId &&
        expansionMap === state.expansionMap &&
        attentionMap === state.attentionMap &&
        attentionTimestampMap === state.attentionTimestampMap &&
        accessMap === state.accessMap &&
        indexedContentIds === state.indexedContentIds &&
        protectedUntilMap === state.protectedUntilMap &&
        contentHeightMap === state.contentHeightMap &&
        manualPlacementMap === state.manualPlacementMap &&
        paperMapsEqual(state.paperMap, nextPaperMap)
      ) {
        return state;
      }

      return {
        ...state,
        paperMap: nextPaperMap,
        expansionMap,
        focusedNodeId,
        attentionMap,
        attentionTimestampMap,
        accessMap,
        indexedContentIds,
        protectedUntilMap,
        contentHeightMap,
        manualPlacementMap,
      };
    }

    case '__SYNC_OPEN_STATE': {
      const nextExpansionMap = command.expansionMap
        ? pruneExpansionMap(normalizeExpansionMap(command.expansionMap), state.paperMap)
        : state.expansionMap;
      // normalizeExpansionMap always allocates a fresh Map, so the reference
      // never matches state.expansionMap. Fall back to a structural compare so
      // an unchanged incoming map does not produce a new state object (which
      // would echo back out through onExpansionMapChange and loop forever).
      const expansionMap = expansionMapsEqual(nextExpansionMap, state.expansionMap)
        ? state.expansionMap
        : nextExpansionMap;
      const focusedNodeId =
        command.focusedNodeId === undefined
          ? state.focusedNodeId
          : command.focusedNodeId !== null && !state.paperMap.has(command.focusedNodeId)
            ? null
            : command.focusedNodeId;
      if (expansionMap === state.expansionMap && focusedNodeId === state.focusedNodeId) return state;
      return { ...state, expansionMap, focusedNodeId };
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

function paperMapsEqual(
  a: PaperViewState['paperMap'],
  b: PaperViewState['paperMap'],
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, paper] of a) {
    if (b.get(id) !== paper) return false;
  }
  return true;
}

function normalizeExpansionMap(input?: PaperViewState['expansionMap']): PaperViewState['expansionMap'] {
  const next: PaperViewState['expansionMap'] = new Map();
  if (!input) return next;
  for (const [parentId, entry] of input) {
    if (entry.openChildSet && entry.openChildSet.size === entry.openChildIds.length) {
      next.set(parentId, entry);
    } else {
      next.set(parentId, { openChildIds: entry.openChildIds, openChildSet: new Set(entry.openChildIds) });
    }
  }
  return next;
}

function expansionMapsEqual(
  a: PaperViewState['expansionMap'],
  b: PaperViewState['expansionMap'],
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [parentId, entryA] of a) {
    const entryB = b.get(parentId);
    if (!entryB) return false;
    const idsA = entryA.openChildIds;
    const idsB = entryB.openChildIds;
    if (idsA.length !== idsB.length) return false;
    for (let i = 0; i < idsA.length; i++) {
      if (idsA[i] !== idsB[i]) return false;
    }
  }
  return true;
}

export function createInitialState(
  paperMap: PaperViewState['paperMap'],
  config: PaperCanvasConfig,
  unplacedNodeIds: PaperViewState['unplacedNodeIds'] = [],
  defaultOpenState?: DefaultOpenState,
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
    expansionMap: normalizeExpansionMap(defaultOpenState?.expansionMap),
    indexedContentIds: new Set(),
    unplacedNodeIds,
    focusedNodeId: defaultOpenState?.focusedNodeId ?? null,
    accessMap,
    attentionMap,
    attentionTimestampMap,
    manualPlacementMap: new Map(),
    contentHeightMap: new Map(),
    protectedUntilMap: new Map(),
  };
}
