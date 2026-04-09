import type { GridPosition, PaperContent, PaperId, PaperViewState } from './types';
import { openChild, closeChild, removeNodeFromExpansion } from './expansion';
import { addChild, moveNode, removeNode } from './tree';
import { nanoid } from './nanoid';

export type Command =
  | { type: 'CREATE_UNPLACED_NODE'; title: string; description: string; content: PaperContent }
  | { type: 'CREATE_CHILD_NODE'; parentId: PaperId; title: string; description: string; content: PaperContent; hue?: number }
  | { type: 'DELETE_NODE'; nodeId: PaperId }
  | { type: 'OPEN_NODE'; parentId: PaperId; childId: PaperId }
  | { type: 'CLOSE_NODE'; parentId: PaperId; childId: PaperId }
  | { type: 'FOCUS_NODE'; nodeId: PaperId }
  | { type: 'MOVE_NODE'; nodeId: PaperId; targetParentId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'REORDER_WITHIN_PARENT'; parentId: PaperId; paperId: PaperId; position: GridPosition }
  | { type: 'ATTACH_UNPLACED_NODE'; nodeId: PaperId; targetParentId: PaperId; insertBeforeId: PaperId | null }
  | { type: 'REPORT_CONTENT_HEIGHT'; nodeId: PaperId; height: number }
  | { type: 'TICK_IMPORTANCE'; now: number }
  | { type: 'AUTO_CLOSE_NODE'; nodeId: PaperId }
  | { type: '__SYNC_PAPER_MAP'; paperMap: PaperViewState['paperMap'] }
  | { type: '__SYNC_EXPANSION'; expansionMap: PaperViewState['expansionMap'] }
  | { type: '__SYNC_FOCUSED'; focusedNodeId: PaperViewState['focusedNodeId'] }
  | { type: '__SYNC_UNPLACED'; unplacedNodeIds: PaperViewState['unplacedNodeIds'] };

const IMPORTANCE_INITIAL = 100;
const IMPORTANCE_OPEN_BONUS = 30;
const IMPORTANCE_FOCUS_BONUS = 20;
const PROTECT_DURATION_MS = 10_000;
const DECAY_RATE = 0.00001;

export function reduce(state: PaperViewState, command: Command): PaperViewState {
  switch (command.type) {
    case 'CREATE_UNPLACED_NODE': {
      const id = nanoid();
      const next = new Map(state.paperMap);
      next.set(id, {
        id,
        title: command.title,
        description: command.description,
        content: command.content,
        parentId: null,
        childIds: [],
      });
      const importanceMap = new Map(state.importanceMap);
      importanceMap.set(id, IMPORTANCE_INITIAL);
      const accessMap = new Map(state.accessMap);
      accessMap.set(id, Date.now());
      return {
        ...state,
        paperMap: next,
        unplacedNodeIds: [...state.unplacedNodeIds, id],
        importanceMap,
        accessMap,
      };
    }

    case 'CREATE_CHILD_NODE': {
      const id = nanoid();
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
      const importanceMap = new Map(state.importanceMap);
      importanceMap.set(id, IMPORTANCE_INITIAL);
      const accessMap = new Map(state.accessMap);
      accessMap.set(id, Date.now());
      const protectedUntilMap = new Map(state.protectedUntilMap);
      protectedUntilMap.set(id, Date.now() + PROTECT_DURATION_MS);
      return {
        ...state,
        paperMap: next,
        expansionMap,
        importanceMap,
        accessMap,
        protectedUntilMap,
        focusedNodeId: id,
      };
    }

    case 'DELETE_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.parentId === null) return state; // root cannot be deleted

      const paperMap = removeNode(state.paperMap, command.nodeId);

      // clean up expansion for deleted subtree
      let expansionMap = new Map(state.expansionMap);
      expansionMap = removeNodeFromExpansion(
        expansionMap,
        state.paperMap,
        node.parentId,
        command.nodeId,
      );

      const importanceMap = new Map(state.importanceMap);
      const accessMap = new Map(state.accessMap);
      importanceMap.delete(command.nodeId);
      accessMap.delete(command.nodeId);

      return {
        ...state,
        paperMap,
        expansionMap,
        importanceMap,
        accessMap,
        focusedNodeId:
          state.focusedNodeId === command.nodeId ? node.parentId : state.focusedNodeId,
      };
    }

    case 'OPEN_NODE': {
      const expansionMap = openChild(state.expansionMap, command.parentId, command.childId);
      const importanceMap = new Map(state.importanceMap);
      const prev = importanceMap.get(command.childId) ?? 0;
      importanceMap.set(command.childId, prev + IMPORTANCE_OPEN_BONUS);
      const accessMap = new Map(state.accessMap);
      accessMap.set(command.childId, Date.now());
      const protectedUntilMap = new Map(state.protectedUntilMap);
      protectedUntilMap.set(command.childId, Date.now() + PROTECT_DURATION_MS);
      return {
        ...state,
        expansionMap,
        importanceMap,
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
      const importanceMap = new Map(state.importanceMap);
      const prev = importanceMap.get(command.nodeId) ?? 0;
      importanceMap.set(command.nodeId, prev + IMPORTANCE_FOCUS_BONUS);
      const accessMap = new Map(state.accessMap);
      accessMap.set(command.nodeId, Date.now());
      return { ...state, importanceMap, accessMap, focusedNodeId: command.nodeId };
    }

    case 'MOVE_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.parentId === null) return state;

      const paperMap = moveNode(
        state.paperMap,
        command.nodeId,
        command.targetParentId,
        command.insertBeforeId,
      );

      // remove from source parent's openChildIds, preserve subtree expansion
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

      const paperMap = addChild(
        state.paperMap,
        command.targetParentId,
        node,
        command.insertBeforeId,
      );
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

    case 'TICK_IMPORTANCE': {
      const importanceMap = new Map(state.importanceMap);
      let changed = false;
      for (const [id, importance] of importanceMap) {
        const lastAccess = state.accessMap.get(id) ?? command.now;
        const t = (command.now - lastAccess) / 1000;
        const decayed = importance * (1 - DECAY_RATE * t * t);
        const next = Math.max(0, decayed);
        if (Math.abs(next - importance) > 0.01) {
          importanceMap.set(id, next);
          changed = true;
        }
      }
      return changed ? { ...state, importanceMap } : state;
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

    case '__SYNC_PAPER_MAP': {
      if (command.paperMap === state.paperMap) return state;
      return { ...state, paperMap: command.paperMap };
    }

    case '__SYNC_EXPANSION': {
      if (command.expansionMap === state.expansionMap) return state;
      return { ...state, expansionMap: command.expansionMap };
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

export function createInitialState(
  paperMap: PaperViewState['paperMap'],
  unplacedNodeIds: PaperViewState['unplacedNodeIds'] = [],
): PaperViewState {
  const importanceMap = new Map<string, number>();
  for (const id of paperMap.keys()) {
    importanceMap.set(id, IMPORTANCE_INITIAL);
  }
  const accessMap = new Map<string, number>();
  const now = Date.now();
  for (const id of paperMap.keys()) {
    accessMap.set(id, now);
  }
  return {
    paperMap,
    expansionMap: new Map(),
    unplacedNodeIds,
    focusedNodeId: null,
    accessMap,
    importanceMap,
    manualPlacementMap: new Map(),
    contentHeightMap: new Map(),
    protectedUntilMap: new Map(),
  };
}
