import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { getAttentionSnapshot, resolveInitialAttention } from './attention';
import type { PaperId, PaperViewState } from './types';

/**
 * Each new paper id needs entries in several id-keyed view-state collections
 * (attention, access, optionally protected). The reverse — DELETE_NODE — needs
 * to drop the same id from all of them. These helpers keep the lifecycle in
 * one place so that adding a new id-keyed collection only requires editing
 * here, not every command that creates or deletes nodes.
 */

export interface RegisterNodeOptions {
  /**
   * If true, also write `protectedUntilMap[id] = now + protectDurationMs`.
   * Used when the user actively places a node (CREATE_CHILD, ATTACH) and we
   * want to shield it from the auto-close heuristic for a moment.
   */
  protect?: boolean;
}

export interface RegisteredViewState {
  attentionMap: PaperViewState['attentionMap'];
  attentionTimestampMap: PaperViewState['attentionTimestampMap'];
  accessMap: PaperViewState['accessMap'];
  protectedUntilMap: PaperViewState['protectedUntilMap'];
}

export function registerNode(
  state: PaperViewState,
  id: PaperId,
  config: PaperCanvasConfig,
  now: number,
  options: RegisterNodeOptions = {},
): RegisteredViewState {
  const attentionMap = new Map(state.attentionMap);
  attentionMap.set(id, config.attention.initial);
  const attentionTimestampMap = new Map(state.attentionTimestampMap);
  attentionTimestampMap.set(id, now);
  const accessMap = new Map(state.accessMap);
  accessMap.set(id, now);
  const protectedUntilMap = options.protect
    ? new Map(state.protectedUntilMap).set(id, now + config.attention.protectDurationMs)
    : state.protectedUntilMap;
  return { attentionMap, attentionTimestampMap, accessMap, protectedUntilMap };
}

export interface UnregisteredViewState {
  attentionMap: PaperViewState['attentionMap'];
  attentionTimestampMap: PaperViewState['attentionTimestampMap'];
  accessMap: PaperViewState['accessMap'];
  indexedContentIds: PaperViewState['indexedContentIds'];
}

export interface TouchNodeOptions {
  /**
   * If true, also extend `protectedUntilMap[id]` so the node is shielded from
   * the auto-close heuristic for `protectDurationMs`. Set this for "the user
   * just opened/created this" interactions.
   */
  protect?: boolean;
}

export interface TouchedViewState {
  attentionMap: PaperViewState['attentionMap'];
  attentionTimestampMap: PaperViewState['attentionTimestampMap'];
  accessMap: PaperViewState['accessMap'];
  protectedUntilMap: PaperViewState['protectedUntilMap'];
}

/**
 * Record that the user interacted with an existing node: bump its attention
 * by `bonus`, refresh its timestamps, and optionally extend its protection
 * window. Used by OPEN_NODE / FOCUS_NODE / LABEL_CLICK_BOOST.
 */
export function touchNode(
  state: PaperViewState,
  id: PaperId,
  bonus: number,
  config: PaperCanvasConfig,
  now: number,
  options: TouchNodeOptions = {},
): TouchedViewState {
  const attentionMap = new Map(state.attentionMap);
  const attentionTimestampMap = new Map(state.attentionTimestampMap);
  const current = getAttentionSnapshot(state, id, config, now).value;
  attentionMap.set(id, Math.max(0, current + bonus));
  attentionTimestampMap.set(id, now);
  const accessMap = new Map(state.accessMap);
  accessMap.set(id, now);
  const protectedUntilMap = options.protect
    ? new Map(state.protectedUntilMap).set(id, now + config.attention.protectDurationMs)
    : state.protectedUntilMap;
  return { attentionMap, attentionTimestampMap, accessMap, protectedUntilMap };
}

export function unregisterNodes(
  state: PaperViewState,
  removedIds: Iterable<PaperId>,
): UnregisteredViewState {
  const attentionMap = new Map(state.attentionMap);
  const attentionTimestampMap = new Map(state.attentionTimestampMap);
  const accessMap = new Map(state.accessMap);
  const indexedContentIds = new Set(state.indexedContentIds);
  for (const id of removedIds) {
    attentionMap.delete(id);
    attentionTimestampMap.delete(id);
    accessMap.delete(id);
    indexedContentIds.delete(id);
  }
  return { attentionMap, attentionTimestampMap, accessMap, indexedContentIds };
}

/**
 * Rebuild attentionMap/attentionTimestampMap to match a wholesale paperMap
 * replacement (UPSERT_PAPERS / MERGE_PAPERS / __SYNC_PAPER_MAP). Papers with
 * an explicit `attentionScore` get reset; others keep their existing values
 * and fall back to the config initial only when missing.
 */
export function syncAttentionForPaperMap(
  state: PaperViewState,
  nextPaperMap: PaperViewState['paperMap'],
  config: PaperCanvasConfig,
  now: number,
): { attentionMap: PaperViewState['attentionMap']; attentionTimestampMap: PaperViewState['attentionTimestampMap'] } {
  const attentionMap = new Map<PaperId, number>();
  const attentionTimestampMap = new Map<PaperId, number>();

  for (const [id, paper] of nextPaperMap) {
    if (paper.attentionScore !== undefined) {
      attentionMap.set(id, resolveInitialAttention(paper, config));
      attentionTimestampMap.set(id, now);
      continue;
    }
    attentionMap.set(id, state.attentionMap.get(id) ?? resolveInitialAttention(paper, config));
    attentionTimestampMap.set(id, state.attentionTimestampMap.get(id) ?? now);
  }

  return { attentionMap, attentionTimestampMap };
}
