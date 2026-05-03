import type { GridPosition, PaperContent, PaperId, PaperViewState, Paper } from './types';
import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { openChild, closeChild, removeNodeFromExpansion } from './expansion';
import { addChild, moveNode, removeNode, type RemoveMode } from './tree';
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
  | { type: 'TICK_IMPORTANCE'; now: number }
  | { type: 'AUTO_CLOSE_NODE'; nodeId: PaperId }
  | { type: 'LABEL_CLICK_BOOST'; nodeId: PaperId }
  | { type: '__SYNC_PAPER_MAP'; paperMap: PaperViewState['paperMap'] }
  | { type: '__SYNC_EXPANSION'; expansionMap: PaperViewState['expansionMap'] }
  | { type: '__SYNC_FOCUSED'; focusedNodeId: PaperViewState['focusedNodeId'] }
  | { type: '__SYNC_UNPLACED'; unplacedNodeIds: PaperViewState['unplacedNodeIds'] };

function resolveInitialImportance(paper: Paper, config: PaperCanvasConfig) {
  return paper.importance ?? config.importance.initial;
}

export function reduce(state: PaperViewState, command: Command, config: PaperCanvasConfig): PaperViewState {
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
      importanceMap.set(id, config.importance.initial);
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
      importanceMap.set(id, config.importance.initial);
      const accessMap = new Map(state.accessMap);
      accessMap.set(id, Date.now());
      const protectedUntilMap = new Map(state.protectedUntilMap);
      protectedUntilMap.set(id, Date.now() + config.importance.protectDurationMs);
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

    case 'PATCH_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node) return state;
      const paperMap = new Map(state.paperMap);
      paperMap.set(command.nodeId, { ...node, ...command.patch });
      return { ...state, paperMap };
    }

    case 'UPSERT_PAPERS': {
      const paperMap = new Map(state.paperMap);
      const importanceMap = new Map(state.importanceMap);
      const accessMap = new Map(state.accessMap);
      const now = Date.now();
      for (const paper of command.papers) {
        const isNew = !paperMap.has(paper.id);
        paperMap.set(paper.id, paper);
        if (isNew) {
          importanceMap.set(paper.id, resolveInitialImportance(paper, config));
          accessMap.set(paper.id, now);
        } else if (paper.importance !== undefined) {
          importanceMap.set(paper.id, paper.importance);
        }
      }
      return { ...state, paperMap, importanceMap, accessMap };
    }

    case 'MERGE_PAPERS': {
      const paperMap = new Map(state.paperMap);
      const importanceMap = new Map(state.importanceMap);
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
          if (paper.importance !== undefined) {
            importanceMap.set(paper.id, paper.importance);
          }
        } else {
          paperMap.set(paper.id, paper);
          importanceMap.set(paper.id, resolveInitialImportance(paper, config));
          accessMap.set(paper.id, now);
        }
      }
      return { ...state, paperMap, importanceMap, accessMap };
    }

    case 'DELETE_NODE': {
      const node = state.paperMap.get(command.nodeId);
      if (!node || node.parentId === null) return state; // root cannot be deleted

      const paperMap = removeNode(state.paperMap, command.nodeId, command.mode ?? 'cascade');

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
      importanceMap.set(command.childId, prev + config.importance.openBonus);
      const accessMap = new Map(state.accessMap);
      accessMap.set(command.childId, Date.now());
      const protectedUntilMap = new Map(state.protectedUntilMap);
      protectedUntilMap.set(command.childId, Date.now() + config.importance.protectDurationMs);
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
      importanceMap.set(command.nodeId, prev + config.importance.focusBonus);
      const accessMap = new Map(state.accessMap);
      accessMap.set(command.nodeId, Date.now());
      return { ...state, importanceMap, accessMap, focusedNodeId: command.nodeId };
    }

    case 'LABEL_CLICK_BOOST': {
      const importanceMap = new Map(state.importanceMap);
      const prev = importanceMap.get(command.nodeId) ?? 0;
      importanceMap.set(command.nodeId, prev + config.importance.labelClickBoost);
      const accessMap = new Map(state.accessMap);
      accessMap.set(command.nodeId, Date.now());
      return { ...state, importanceMap, accessMap };
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
        const decayed = importance * (1 - config.importance.decayRate * t * t);
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
      const importanceMap = new Map(state.importanceMap);
      for (const [id, paper] of command.paperMap) {
        if (!importanceMap.has(id)) {
          importanceMap.set(id, resolveInitialImportance(paper, config));
          continue;
        }
        if (paper.importance !== undefined) {
          importanceMap.set(id, paper.importance);
        }
      }
      return { ...state, paperMap: command.paperMap, importanceMap };
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
  config: PaperCanvasConfig,
  unplacedNodeIds: PaperViewState['unplacedNodeIds'] = [],
): PaperViewState {
  const importanceMap = new Map<string, number>();
  for (const [id, paper] of paperMap) {
    importanceMap.set(id, resolveInitialImportance(paper, config));
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
