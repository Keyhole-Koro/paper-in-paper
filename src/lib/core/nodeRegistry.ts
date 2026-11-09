import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { getEffectiveAttention, resolveInitialAttention } from './attention';
import type { Paper, PaperId, PaperMap, PaperViewState } from './types';

/**
 * Each paper id has entries in several id-keyed view-state collections (attention, access,
 * protection, indexing). These helpers keep that lifecycle in one place, so adding a collection
 * only means editing here, not every command that creates or removes papers.
 */

type AttentionSlices = Pick<
  PaperViewState,
  'clock' | 'attentionMap' | 'attentionTimestampMap' | 'accessMap' | 'protectedUntilMap'
>;

export interface RegisterNodeOptions {
  /** Shield the paper from space management for `protectInteractions` ticks. */
  protect?: boolean;
}

/** Gives a new paper its initial attention at the state's clock. */
export function registerNode(
  state: PaperViewState,
  paper: Paper,
  config: PaperCanvasConfig,
  options: RegisterNodeOptions = {},
): AttentionSlices {
  const attentionMap = new Map(state.attentionMap).set(paper.id, resolveInitialAttention(paper, config));
  const attentionTimestampMap = new Map(state.attentionTimestampMap).set(paper.id, state.clock);
  const accessMap = new Map(state.accessMap).set(paper.id, state.clock);
  const protectedUntilMap = options.protect
    ? new Map(state.protectedUntilMap).set(paper.id, state.clock + config.attention.protectInteractions)
    : state.protectedUntilMap;
  return { clock: state.clock, attentionMap, attentionTimestampMap, accessMap, protectedUntilMap };
}

export interface TouchNodeOptions {
  /** Also shield the paper from space management for `protectInteractions` ticks. */
  protect?: boolean;
}

/**
 * Records one user interaction with an existing paper: the clock advances by one (so every other
 * paper decays a step), then the paper gets `bonus` on top of its decayed attention.
 */
export function touchNode(
  state: PaperViewState,
  id: PaperId,
  bonus: number,
  config: PaperCanvasConfig,
  options: TouchNodeOptions = {},
): AttentionSlices {
  const clock = state.clock + 1;
  const current = getEffectiveAttention({ ...state, clock }, id, config);
  const attentionMap = new Map(state.attentionMap).set(id, Math.max(0, current + bonus));
  const attentionTimestampMap = new Map(state.attentionTimestampMap).set(id, clock);
  const accessMap = new Map(state.accessMap).set(id, clock);
  const protectedUntilMap = options.protect
    ? new Map(state.protectedUntilMap).set(id, clock + config.attention.protectInteractions)
    : state.protectedUntilMap;
  return { clock, attentionMap, attentionTimestampMap, accessMap, protectedUntilMap };
}

/** Drops removed ids from every id-keyed collection. */
export function unregisterNodes(
  state: PaperViewState,
  removedIds: ReadonlySet<PaperId>,
): Pick<PaperViewState, 'attentionMap' | 'attentionTimestampMap' | 'accessMap' | 'protectedUntilMap' | 'indexedContentIds'> {
  return {
    attentionMap: withoutIds(state.attentionMap, removedIds),
    attentionTimestampMap: withoutIds(state.attentionTimestampMap, removedIds),
    accessMap: withoutIds(state.accessMap, removedIds),
    protectedUntilMap: withoutIds(state.protectedUntilMap, removedIds),
    indexedContentIds: withoutIdsInSet(state.indexedContentIds, removedIds),
  };
}

export function withoutIds<V>(map: Map<PaperId, V>, removedIds: ReadonlySet<PaperId>): Map<PaperId, V> {
  let next: Map<PaperId, V> | null = null;
  for (const id of removedIds) {
    if (!map.has(id)) continue;
    next ??= new Map(map);
    next.delete(id);
  }
  return next ?? map;
}

export function withoutIdsInSet(set: Set<PaperId>, removedIds: ReadonlySet<PaperId>): Set<PaperId> {
  let next: Set<PaperId> | null = null;
  for (const id of removedIds) {
    if (!set.has(id)) continue;
    next ??= new Set(set);
    next.delete(id);
  }
  return next ?? set;
}

/**
 * Attention for a replaced paper map: new papers start at their initial attention, papers whose
 * `attentionScore` changed are reset to it, and everything else keeps its earned attention.
 * Unchanged maps keep their identity.
 */
export function syncAttentionForPaperMap(
  state: PaperViewState,
  nextPaperMap: PaperMap,
  config: PaperCanvasConfig,
): Pick<PaperViewState, 'attentionMap' | 'attentionTimestampMap' | 'accessMap'> {
  let attentionMap: Map<PaperId, number> | null = null;
  let attentionTimestampMap: Map<PaperId, number> | null = null;
  let accessMap: Map<PaperId, number> | null = null;

  for (const [id, paper] of nextPaperMap) {
    const previous = state.paperMap.get(id);
    const isNew = !state.attentionMap.has(id);
    const scoreChanged = previous !== undefined
      && paper.attentionScore !== undefined
      && paper.attentionScore !== previous.attentionScore;
    if (!isNew && !scoreChanged) continue;
    attentionMap ??= new Map(state.attentionMap);
    attentionTimestampMap ??= new Map(state.attentionTimestampMap);
    attentionMap.set(id, resolveInitialAttention(paper, config));
    attentionTimestampMap.set(id, state.clock);
    if (!state.accessMap.has(id)) {
      accessMap ??= new Map(state.accessMap);
      accessMap.set(id, state.clock);
    }
  }

  return {
    attentionMap: attentionMap ?? state.attentionMap,
    attentionTimestampMap: attentionTimestampMap ?? state.attentionTimestampMap,
    accessMap: accessMap ?? state.accessMap,
  };
}
