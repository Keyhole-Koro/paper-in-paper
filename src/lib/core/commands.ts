import type { ExpansionMap, Paper, PaperContent, PaperId, PaperMap, PaperViewState } from './types';
import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { resolveInitialAttention } from './attention';
import {
  closeChild,
  detachChild,
  expansionMapsEqual,
  getOpenChildIds,
  getOpenChildSet,
  isOpen,
  normalizeExpansionMap,
  openChild,
  pruneExpansionIds,
} from './expansion';
import { deriveNodeVisibilityState } from './nodeVisibility';
import {
  registerNode,
  syncAttentionForPaperMap,
  touchNode,
  unregisterNodes,
  withoutIdsInSet,
} from './nodeRegistry';
import {
  addChild,
  canMoveNode,
  getAncestorIds,
  getDescendantIds,
  isSelfOrAncestor,
  moveNode,
  removeNode,
  type RemoveMode,
} from './tree';
import { createId } from './createId';

export interface DefaultOpenState {
  expansionMap?: ExpansionMap;
  focusedNodeId?: PaperId | null;
}

export type Command =
  | { type: 'CREATE_UNPLACED_NODE'; id?: PaperId; title: string; description: string; content: PaperContent }
  | { type: 'CREATE_CHILD_NODE'; id?: PaperId; parentId: PaperId; title: string; description: string; content: PaperContent; hue?: number }
  | { type: 'DELETE_NODE'; nodeId: PaperId; mode?: RemoveMode }
  | { type: 'PATCH_NODE'; nodeId: PaperId; patch: Partial<Omit<Paper, 'id' | 'parentId' | 'childIds'>> }
  | { type: 'UPSERT_PAPERS'; papers: Paper[] }
  | { type: 'MERGE_PAPERS'; papers: Paper[] }
  | { type: 'OPEN_NODE'; parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE_NODE'; parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE_CHILDREN'; nodeId: PaperId }
  | { type: 'AUTO_CLOSE_NODE'; nodeId: PaperId }
  | { type: 'FOCUS_NODE'; nodeId: PaperId }
  | { type: 'REVEAL_NODE'; nodeId: PaperId }
  | { type: 'MOVE_NODE'; nodeId: PaperId; targetParentId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'REORDER_WITHIN_PARENT'; parentId: PaperId; paperId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'ATTACH_UNPLACED_NODE'; nodeId: PaperId; targetParentId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'INDEX_CONTENT'; nodeId: PaperId }
  | { type: 'UNINDEX_CONTENT'; nodeId: PaperId }
  | { type: 'PIN_NODE'; nodeId: PaperId; minShare?: number }
  | { type: 'UNPIN_NODE'; nodeId: PaperId }
  | { type: 'LABEL_CLICK_BOOST'; nodeId: PaperId }
  | { type: 'SET_PAPER_MAP'; paperMap: PaperMap }
  | { type: 'SET_OPEN_STATE'; expansionMap?: ExpansionMap; focusedNodeId?: PaperId | null }
  | { type: 'SET_UNPLACED'; unplacedNodeIds: PaperId[] };

export interface ReduceOptions {
  /** Id generator for CREATE_* commands that do not carry an id. Defaults to a random UUID. */
  createId?: () => PaperId;
}

const DEFAULT_PIN_SHARE = 0.3;
const MIN_PIN_SHARE = 0.05;
const MAX_PIN_SHARE = 0.9;

function withoutPin(paperMap: PaperMap, nodeId: PaperId): PaperMap {
  const node = paperMap.get(nodeId);
  if (!node || node.pinnedLayout === undefined) return paperMap;
  const next = new Map(paperMap);
  next.set(nodeId, { ...node, pinnedLayout: undefined });
  return next;
}

/**
 * Where `insertBeforeId` (a child of `parentId`) lands in the parent's open list: before it when
 * it is open, otherwise before the next open child in `childIds` order, otherwise at the end.
 */
function openListInsertBefore(
  expansionMap: ExpansionMap,
  paperMap: PaperMap,
  parentId: PaperId,
  insertBeforeId: PaperId | null,
  movingId: PaperId,
): PaperId | null {
  if (insertBeforeId === null) return null;
  const open = getOpenChildSet(expansionMap, parentId);
  if (open.has(insertBeforeId) && insertBeforeId !== movingId) return insertBeforeId;
  const childIds = paperMap.get(parentId)?.childIds ?? [];
  const start = childIds.indexOf(insertBeforeId);
  if (start === -1) return null;
  for (let i = start + 1; i < childIds.length; i += 1) {
    if (childIds[i] !== movingId && open.has(childIds[i])) return childIds[i];
  }
  return null;
}

/** Hides `childId` and everything below it, and moves focus out of what was hidden. */
function closeSubtree(state: PaperViewState, parentId: PaperId, childId: PaperId): PaperViewState {
  const expansionMap = closeChild(state.expansionMap, state.paperMap, parentId, childId);
  const hidden = new Set([childId, ...getDescendantIds(state.paperMap, childId)]);
  const indexedContentIds = withoutIdsInSet(state.indexedContentIds, hidden);
  const focusedNodeId = state.focusedNodeId !== null && hidden.has(state.focusedNodeId)
    ? parentId
    : state.focusedNodeId;
  if (
    expansionMap === state.expansionMap
    && indexedContentIds === state.indexedContentIds
    && focusedNodeId === state.focusedNodeId
  ) {
    return state;
  }
  return { ...state, expansionMap, indexedContentIds, focusedNodeId };
}

/**
 * Closes the open-state edge parent → child. A real child closes with its subtree; an entry that
 * does not match the tree (restored or stale state) is just dropped.
 */
function closeEdge(state: PaperViewState, parentId: PaperId, childId: PaperId): PaperViewState {
  if (state.paperMap.get(childId)?.parentId === parentId) return closeSubtree(state, parentId, childId);
  const expansionMap = detachChild(state.expansionMap, parentId, childId);
  return expansionMap === state.expansionMap ? state : { ...state, expansionMap };
}

function reorderOpenChild(
  state: PaperViewState,
  parentId: PaperId,
  paperId: PaperId,
  insertBeforeId: PaperId | null,
  paperMap: PaperMap,
): ExpansionMap {
  if (!isOpen(state.expansionMap, parentId, paperId)) return state.expansionMap;
  const before = openListInsertBefore(state.expansionMap, paperMap, parentId, insertBeforeId, paperId);
  return openChild(state.expansionMap, parentId, paperId, before);
}

/** CREATE_CHILD_NODE: a new paper at the end of its parent's children, open and focused. */
function createChildNode(
  state: PaperViewState,
  command: Extract<Command, { type: 'CREATE_CHILD_NODE' }>,
  config: PaperCanvasConfig,
  options: ReduceOptions,
): PaperViewState {
  const parent = state.paperMap.get(command.parentId);
  if (!parent) return state;
  const id = command.id ?? (options.createId ?? createId)();
  if (state.paperMap.has(id)) return state;
  const paper: Paper = {
    id,
    title: command.title,
    description: command.description,
    content: command.content,
    ...(command.hue !== undefined ? { hue: command.hue } : {}),
    parentId: parent.id,
    childIds: [],
  };
  const paperMap = new Map(state.paperMap);
  paperMap.set(id, paper);
  paperMap.set(parent.id, { ...parent, childIds: [...parent.childIds, id] });
  return {
    ...state,
    paperMap,
    expansionMap: openChild(state.expansionMap, parent.id, id),
    ...registerNode({ ...state, clock: state.clock + 1 }, paper, config, { protect: true }),
    focusedNodeId: id,
  };
}

/** DELETE_NODE: the paper and its subtree (cascade), or the paper alone with its children lifted. */
function deleteNode(state: PaperViewState, nodeId: PaperId, mode: RemoveMode = 'cascade'): PaperViewState {
  const node = state.paperMap.get(nodeId);
  if (!node) return state;
  const isUnplaced = state.unplacedNodeIds.includes(node.id);
  if (node.parentId === null && !isUnplaced) return state; // the root stays

  const removedIds = new Set(
    mode === 'cascade' ? [node.id, ...getDescendantIds(state.paperMap, node.id)] : [node.id],
  );
  const paperMap = removeNode(state.paperMap, node.id, mode);

  let expansionMap = state.expansionMap;
  if (node.parentId !== null) {
    const parentOpen = getOpenChildIds(expansionMap, node.parentId);
    const position = parentOpen.indexOf(node.id);
    const wasOpen = position !== -1;
    const liftedOpen = mode === 'lift' ? getOpenChildIds(expansionMap, node.id) : [];
    const after = wasOpen ? parentOpen[position + 1] ?? null : null;
    expansionMap = detachChild(expansionMap, node.parentId, node.id);
    if (wasOpen) {
      // Lifted children that were open stay open, where their parent was.
      for (const childId of liftedOpen) {
        expansionMap = openChild(expansionMap, node.parentId, childId, after);
      }
    }
  }
  expansionMap = pruneExpansionIds(expansionMap, removedIds);

  let unplacedNodeIds = state.unplacedNodeIds.filter((id) => !removedIds.has(id));
  if (mode === 'lift' && node.parentId === null) {
    unplacedNodeIds = [...unplacedNodeIds, ...node.childIds.filter((id) => paperMap.has(id))];
  }
  const focusedNodeId = state.focusedNodeId !== null && removedIds.has(state.focusedNodeId)
    ? node.parentId
    : state.focusedNodeId;

  return {
    ...state,
    ...unregisterNodes(state, removedIds),
    paperMap,
    expansionMap,
    unplacedNodeIds,
    focusedNodeId,
  };
}

/** REVEAL_NODE: opens the chain from the root down to a paper wherever it lives, and focuses it. */
function revealNode(state: PaperViewState, nodeId: PaperId, config: PaperCanvasConfig): PaperViewState {
  const node = state.paperMap.get(nodeId);
  if (!node) return state;
  const ancestors = getAncestorIds(state.paperMap, node.id);
  if (ancestors === null) return state;
  const top = ancestors[0] ?? node.id;
  if (state.unplacedNodeIds.includes(top)) return state;

  const chain = [...ancestors, node.id];
  let expansionMap = state.expansionMap;
  for (let i = 0; i + 1 < chain.length; i += 1) {
    expansionMap = openChild(expansionMap, chain[i], chain[i + 1]);
  }
  const touched = touchNode(state, node.id, config.attention.openBonus, config, { protect: true });
  const protectedUntilMap = new Map(touched.protectedUntilMap);
  for (const id of chain.slice(1)) {
    protectedUntilMap.set(id, Math.max(protectedUntilMap.get(id) ?? 0, touched.clock + config.attention.protectInteractions));
  }
  return {
    ...state,
    ...touched,
    protectedUntilMap,
    expansionMap,
    indexedContentIds: withoutIdsInSet(state.indexedContentIds, new Set([node.id])),
    focusedNodeId: node.id,
  };
}

/**
 * MOVE_NODE: within the same parent a reorder (of the children and of the open list); to another
 * parent a move that keeps what is open inside the paper.
 */
function movePaper(
  state: PaperViewState,
  { nodeId, targetParentId, insertBeforeId }: Extract<Command, { type: 'MOVE_NODE' }>,
  config: PaperCanvasConfig,
): PaperViewState {
  if (!canMoveNode(state.paperMap, nodeId, targetParentId)) return state;
  const node = state.paperMap.get(nodeId)!;
  const sourceParentId = node.parentId!;

  if (sourceParentId === targetParentId) {
    if (insertBeforeId === nodeId) return state;
    const paperMap = moveNode(state.paperMap, nodeId, targetParentId, insertBeforeId);
    const expansionMap = reorderOpenChild(state, targetParentId, nodeId, insertBeforeId, paperMap);
    if (paperMap === state.paperMap && expansionMap === state.expansionMap) return state;
    return {
      ...state,
      ...touchNode(state, nodeId, config.attention.focusBonus, config),
      paperMap,
      expansionMap,
      focusedNodeId: nodeId,
    };
  }

  const moved = moveNode(state.paperMap, nodeId, targetParentId, insertBeforeId);
  if (moved === state.paperMap) return state;
  const paperMap = withoutPin(moved, nodeId);
  // Only the edge from the old parent goes: the moved paper keeps its own open subtree.
  let expansionMap = detachChild(state.expansionMap, sourceParentId, nodeId);
  expansionMap = openChild(
    expansionMap,
    targetParentId,
    nodeId,
    openListInsertBefore(expansionMap, paperMap, targetParentId, insertBeforeId, nodeId),
  );
  return {
    ...state,
    ...touchNode(state, nodeId, config.attention.focusBonus, config, { protect: true }),
    paperMap,
    expansionMap,
    focusedNodeId: nodeId,
  };
}

/** ATTACH_UNPLACED_NODE: places an unplaced paper under a parent, open and focused. */
function attachUnplacedNode(
  state: PaperViewState,
  { nodeId, targetParentId, insertBeforeId }: Extract<Command, { type: 'ATTACH_UNPLACED_NODE' }>,
  config: PaperCanvasConfig,
): PaperViewState {
  const node = state.paperMap.get(nodeId);
  if (!node || !state.unplacedNodeIds.includes(nodeId) || !state.paperMap.has(targetParentId)) return state;
  if (isSelfOrAncestor(state.paperMap, nodeId, targetParentId)) return state;

  const paperMap = withoutPin(addChild(state.paperMap, targetParentId, node, insertBeforeId), nodeId);
  const expansionMap = openChild(
    state.expansionMap,
    targetParentId,
    nodeId,
    openListInsertBefore(state.expansionMap, paperMap, targetParentId, insertBeforeId, nodeId),
  );
  return {
    ...state,
    ...touchNode(state, nodeId, config.attention.openBonus, config, { protect: true }),
    paperMap,
    expansionMap,
    unplacedNodeIds: state.unplacedNodeIds.filter((id) => id !== nodeId),
    focusedNodeId: nodeId,
  };
}

/** The closest ancestor of `nodeId` (in `before`) that `after` still has, or null. Cycle-safe. */
function nearestRemainingAncestor(before: PaperMap, nodeId: PaperId, after: PaperMap): PaperId | null {
  const seen = new Set<PaperId>();
  let candidate = before.get(nodeId)?.parentId ?? null;
  while (candidate !== null && !after.has(candidate) && !seen.has(candidate)) {
    seen.add(candidate);
    candidate = before.get(candidate)?.parentId ?? null;
  }
  return candidate !== null && after.has(candidate) ? candidate : null;
}

/** SET_PAPER_MAP: the host's papers replace the canvas's. */
function setPaperMap(state: PaperViewState, next: PaperMap, config: PaperCanvasConfig): PaperViewState {
  if (next === state.paperMap) return state;

  // Only ids that disappeared are forgotten. Open state naming papers that never loaded is
  // kept, so restored state comes alive when those papers arrive.
  const removed = new Set<PaperId>();
  for (const id of state.paperMap.keys()) if (!next.has(id)) removed.add(id);

  const attention = syncAttentionForPaperMap(state, next, config);
  const pruned = unregisterNodes({ ...state, ...attention }, removed);
  const expansionMap = pruneExpansionIds(state.expansionMap, removed);
  const unplacedNodeIds = removed.size > 0
    ? state.unplacedNodeIds.filter((id) => !removed.has(id))
    : state.unplacedNodeIds;
  const focusedNodeId = state.focusedNodeId !== null && removed.has(state.focusedNodeId)
    ? nearestRemainingAncestor(state.paperMap, state.focusedNodeId, next)
    : state.focusedNodeId;

  if (
    removed.size === 0
    && pruned.attentionMap === state.attentionMap
    && pruned.attentionTimestampMap === state.attentionTimestampMap
    && pruned.accessMap === state.accessMap
    && paperMapsEqual(state.paperMap, next)
  ) {
    // Same papers in a new Map: keep the state so nothing downstream re-renders.
    return state;
  }

  // Papers that arrive already open (restored state waiting for them) are shielded like
  // any other restored paper.
  let protectedUntilMap = pruned.protectedUntilMap;
  const until = state.clock + config.attention.protectInteractions;
  for (const entry of expansionMap.values()) {
    for (const id of entry.openChildIds) {
      if (state.paperMap.has(id) || !next.has(id) || (protectedUntilMap.get(id) ?? -Infinity) >= until) continue;
      if (protectedUntilMap === pruned.protectedUntilMap) protectedUntilMap = new Map(protectedUntilMap);
      protectedUntilMap.set(id, until);
    }
  }

  return {
    ...state,
    ...pruned,
    protectedUntilMap,
    paperMap: next,
    expansionMap,
    unplacedNodeIds,
    focusedNodeId,
  };
}

/** Restored papers are not something the reader just chose to hide: shield them for a while. */
function protectNewlyOpened(state: PaperViewState, expansionMap: ExpansionMap, config: PaperCanvasConfig) {
  let protectedUntilMap: Map<PaperId, number> | null = null;
  const until = state.clock + config.attention.protectInteractions;
  for (const [parentId, entry] of expansionMap) {
    const before = getOpenChildSet(state.expansionMap, parentId);
    for (const id of entry.openChildIds) {
      // Papers that have not loaded yet get their protection when they arrive (SET_PAPER_MAP).
      if (!state.paperMap.has(id) || before.has(id) || (state.protectedUntilMap.get(id) ?? -Infinity) >= until) continue;
      protectedUntilMap ??= new Map(state.protectedUntilMap);
      protectedUntilMap.set(id, until);
    }
  }
  return protectedUntilMap ?? state.protectedUntilMap;
}

/**
 * The state after `command`. Pure apart from id generation for CREATE_* commands without an id
 * (pass `options.createId` to make that deterministic). Invalid commands return `state`
 * unchanged, so callers can compare by identity.
 */
export function reduce(
  state: PaperViewState,
  command: Command,
  config: PaperCanvasConfig,
  options: ReduceOptions = {},
): PaperViewState {
  switch (command.type) {
    case 'CREATE_UNPLACED_NODE': {
      const id = command.id ?? (options.createId ?? createId)();
      if (state.paperMap.has(id)) return state;
      const paper: Paper = {
        id,
        title: command.title,
        description: command.description,
        content: command.content,
        parentId: null,
        childIds: [],
      };
      return {
        ...state,
        paperMap: new Map(state.paperMap).set(id, paper),
        unplacedNodeIds: [...state.unplacedNodeIds, id],
        ...registerNode(state, paper, config),
      };
    }

    case 'CREATE_CHILD_NODE':
      return createChildNode(state, command, config, options);

    case 'DELETE_NODE':
      return deleteNode(state, command.nodeId, command.mode);

    case 'PATCH_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node) return state;
      const patched: Paper = { ...node, ...command.patch, id: node.id, parentId: node.parentId, childIds: node.childIds };
      const paperMap = new Map(state.paperMap).set(node.id, patched);
      if (command.patch.attentionScore === undefined) return { ...state, paperMap };
      return {
        ...state,
        paperMap,
        attentionMap: new Map(state.attentionMap).set(node.id, resolveInitialAttention(patched, config)),
        attentionTimestampMap: new Map(state.attentionTimestampMap).set(node.id, state.clock),
      };
    }

    case 'UPSERT_PAPERS': {
      if (command.papers.length === 0) return state;
      const paperMap = new Map(state.paperMap);
      for (const paper of command.papers) paperMap.set(paper.id, paper);
      return { ...state, paperMap, ...syncAttentionForPaperMap(state, paperMap, config) };
    }

    case 'MERGE_PAPERS': {
      if (command.papers.length === 0) return state;
      const paperMap = new Map(state.paperMap);
      for (const paper of command.papers) {
        const existing = paperMap.get(paper.id);
        paperMap.set(paper.id, existing
          ? {
              ...existing,
              ...paper,
              childIds: Array.from(new Set([...existing.childIds, ...paper.childIds])),
              parentId: paper.parentId ?? existing.parentId,
            }
          : paper);
      }
      return { ...state, paperMap, ...syncAttentionForPaperMap(state, paperMap, config) };
    }

    case 'OPEN_NODE': {
      const child = state.paperMap.get(command.childId);
      // Only a real child can open inside a paper. Anything else (a link to an ancestor, a
      // sibling, an unknown id) would render a paper twice or loop; links use REVEAL_NODE.
      if (!child || child.parentId !== command.parentId || !state.paperMap.has(command.parentId)) return state;
      return {
        ...state,
        ...touchNode(state, child.id, config.attention.openBonus, config, { protect: true }),
        expansionMap: openChild(state.expansionMap, command.parentId, child.id),
        indexedContentIds: withoutIdsInSet(state.indexedContentIds, new Set([child.id])),
        focusedNodeId: child.id,
      };
    }

    case 'CLOSE_NODE': {
      return closeEdge(state, command.parentId, command.childId);
    }

    case 'CLOSE_CHILDREN': {
      let next = state;
      for (const childId of getOpenChildIds(state.expansionMap, command.nodeId)) {
        next = closeEdge(next, command.nodeId, childId);
      }
      return next;
    }

    case 'AUTO_CLOSE_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.parentId === null) return state;
      return closeSubtree(state, node.parentId, node.id);
    }

    case 'FOCUS_NODE': {
      if (!state.paperMap.has(command.nodeId)) return state;
      return {
        ...state,
        ...touchNode(state, command.nodeId, config.attention.focusBonus, config),
        focusedNodeId: command.nodeId,
      };
    }

    case 'REVEAL_NODE':
      return revealNode(state, command.nodeId, config);

    case 'MOVE_NODE':
      return movePaper(state, command, config);

    case 'REORDER_WITHIN_PARENT': {
      const paper = state.paperMap.get(command.paperId);
      if (!paper || paper.parentId !== command.parentId || command.insertBeforeId === command.paperId) return state;
      const expansionMap = reorderOpenChild(state, command.parentId, command.paperId, command.insertBeforeId, state.paperMap);
      if (expansionMap === state.expansionMap) return state;
      return {
        ...state,
        ...touchNode(state, command.paperId, config.attention.focusBonus, config),
        expansionMap,
        focusedNodeId: command.paperId,
      };
    }

    case 'ATTACH_UNPLACED_NODE':
      return attachUnplacedNode(state, command, config);

    case 'INDEX_CONTENT': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.parentId === null || state.indexedContentIds.has(node.id)) return state;
      if (deriveNodeVisibilityState(node.id, state) !== 'expanded') return state;
      return { ...state, indexedContentIds: new Set(state.indexedContentIds).add(node.id) };
    }

    case 'UNINDEX_CONTENT': {
      if (!state.indexedContentIds.has(command.nodeId)) return state;
      // The relayout after an unindex would otherwise pick the same paper again right away.
      const protectedUntilMap = new Map(state.protectedUntilMap).set(
        command.nodeId,
        state.clock + config.attention.protectInteractions,
      );
      return {
        ...state,
        indexedContentIds: withoutIdsInSet(state.indexedContentIds, new Set([command.nodeId])),
        protectedUntilMap,
      };
    }

    case 'PIN_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node) return state;
      const requested = command.minShare ?? node.pinnedLayout?.minShare ?? DEFAULT_PIN_SHARE;
      const minShare = Math.min(MAX_PIN_SHARE, Math.max(MIN_PIN_SHARE, Number.isFinite(requested) ? requested : DEFAULT_PIN_SHARE));
      return {
        ...state,
        paperMap: new Map(state.paperMap).set(node.id, { ...node, pinnedLayout: { minShare, pinnedAt: state.clock } }),
      };
    }

    case 'UNPIN_NODE': {
      const paperMap = withoutPin(state.paperMap, command.nodeId);
      return paperMap === state.paperMap ? state : { ...state, paperMap };
    }

    case 'LABEL_CLICK_BOOST': {
      // The reader asked for an indexed paper back: show its content, boost and focus it, and
      // keep space management off it for a while.
      if (!state.paperMap.has(command.nodeId)) return state;
      return {
        ...state,
        ...touchNode(state, command.nodeId, config.attention.labelClickBoost, config, { protect: true }),
        indexedContentIds: withoutIdsInSet(state.indexedContentIds, new Set([command.nodeId])),
        focusedNodeId: command.nodeId,
      };
    }

    case 'SET_PAPER_MAP':
      return setPaperMap(state, command.paperMap, config);

    case 'SET_OPEN_STATE': {
      let expansionMap = state.expansionMap;
      if (command.expansionMap !== undefined) {
        const normalized = normalizeExpansionMap(command.expansionMap);
        if (!expansionMapsEqual(normalized, state.expansionMap)) expansionMap = normalized;
      }
      const focusedNodeId = command.focusedNodeId === undefined ? state.focusedNodeId : command.focusedNodeId;
      if (expansionMap === state.expansionMap && focusedNodeId === state.focusedNodeId) return state;
      return {
        ...state,
        expansionMap,
        focusedNodeId,
        protectedUntilMap: protectNewlyOpened(state, expansionMap, config),
      };
    }

    case 'SET_UNPLACED': {
      if (command.unplacedNodeIds === state.unplacedNodeIds) return state;
      return { ...state, unplacedNodeIds: command.unplacedNodeIds };
    }

    default:
      return state;
  }
}

function paperMapsEqual(a: PaperMap, b: PaperMap): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [id, paper] of a) {
    if (b.get(id) !== paper) return false;
  }
  return true;
}

export function createInitialState(
  paperMap: PaperMap,
  config: PaperCanvasConfig,
  unplacedNodeIds: PaperViewState['unplacedNodeIds'] = [],
  defaultOpenState?: DefaultOpenState,
): PaperViewState {
  const attentionMap = new Map<PaperId, number>();
  const attentionTimestampMap = new Map<PaperId, number>();
  const accessMap = new Map<PaperId, number>();
  for (const [id, paper] of paperMap) {
    attentionMap.set(id, resolveInitialAttention(paper, config));
    attentionTimestampMap.set(id, 0);
    accessMap.set(id, 0);
  }
  const expansionMap = normalizeExpansionMap(defaultOpenState?.expansionMap);
  const protectedUntilMap = new Map<PaperId, number>();
  for (const entry of expansionMap.values()) {
    for (const id of entry.openChildIds) {
      if (paperMap.has(id)) protectedUntilMap.set(id, config.attention.protectInteractions);
    }
  }
  return {
    paperMap,
    expansionMap,
    indexedContentIds: new Set(),
    unplacedNodeIds,
    focusedNodeId: defaultOpenState?.focusedNodeId ?? null,
    clock: 0,
    attentionMap,
    attentionTimestampMap,
    accessMap,
    protectedUntilMap,
  };
}
