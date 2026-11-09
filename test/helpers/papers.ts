import { resolvePaperCanvasConfig, type PaperCanvasConfig, type PaperCanvasConfigInput } from '../../src/lib/config/paperCanvasConfig';
import { createInitialState, reduce, type Command, type DefaultOpenState } from '../../src/lib/core/commands';
import { buildPaperMap } from '../../src/lib/core/tree';
import type { ExpansionMap, Paper, PaperId, PaperMap, PaperViewState } from '../../src/lib/core/types';

export const config: PaperCanvasConfig = resolvePaperCanvasConfig();

export function makeConfig(input: PaperCanvasConfigInput): PaperCanvasConfig {
  return resolvePaperCanvasConfig(input);
}

/**
 * Builds a paper map from an outline: `{ root: ['a', 'b'], a: ['a1'] }` makes root → a, b and
 * a → a1. Every id mentioned gets a paper; `extra` overrides fields per id.
 */
export function tree(
  outline: Record<PaperId, PaperId[]>,
  extra: Record<PaperId, Partial<Paper>> = {},
): PaperMap {
  const parentOf = new Map<PaperId, PaperId>();
  const ids = new Set<PaperId>();
  for (const [parent, children] of Object.entries(outline)) {
    ids.add(parent);
    for (const child of children) {
      ids.add(child);
      parentOf.set(child, parent);
    }
  }
  const papers: Paper[] = Array.from(ids, (id) => ({
    id,
    title: id,
    description: '',
    content: '',
    parentId: parentOf.get(id) ?? null,
    childIds: outline[id] ?? [],
    ...extra[id],
  }));
  return buildPaperMap(papers);
}

export function expansion(entries: Record<PaperId, PaperId[]>): ExpansionMap {
  return new Map(Object.entries(entries).map(([parentId, ids]) => [parentId, { openChildIds: ids }]));
}

export function stateOf(
  paperMap: PaperMap,
  openState?: DefaultOpenState,
  cfg: PaperCanvasConfig = config,
): PaperViewState {
  return createInitialState(paperMap, cfg, [], openState);
}

let idCounter = 0;
/** Deterministic ids for CREATE_* commands. */
export const testIds = () => `new-${(idCounter += 1)}`;

export function run(state: PaperViewState, commands: Command[], cfg: PaperCanvasConfig = config): PaperViewState {
  return commands.reduce((current, command) => reduce(current, command, cfg, { createId: testIds }), state);
}

export const open = (parentId: PaperId, childId: PaperId): Command => ({ type: 'OPEN_NODE', parentId, childId });
export const close = (parentId: PaperId, childId: PaperId): Command => ({ type: 'CLOSE_NODE', parentId, childId });
export const focus = (nodeId: PaperId): Command => ({ type: 'FOCUS_NODE', nodeId });

export function openIds(state: PaperViewState, parentId: PaperId): readonly PaperId[] {
  return state.expansionMap.get(parentId)?.openChildIds ?? [];
}

/** Mulberry32: a small seeded PRNG so randomized tests replay exactly. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
