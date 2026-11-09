import { describe, expect, it } from 'vitest';
import { reduce, type Command } from '../../src/lib/core/commands';
import { getVisibleChildIds } from '../../src/lib/core/expansion';
import { computeCanvasLayout } from '../../src/lib/core/layout';
import { settleSpace } from '../../src/lib/core/spaceManagement';
import { checkTreeInvariants, getDescendantIds } from '../../src/lib/core/tree';
import type { PaperId, PaperViewState } from '../../src/lib/core/types';
import { config, seededRandom, stateOf, tree } from '../helpers/papers';

/**
 * Throws random command sequences — valid and invalid, including the inputs that used to break
 * the tree (moves into a subtree, links to ancestors, stale ids) — at the reducer and checks the
 * invariants after every step.
 */

const BASE = () => tree({
  root: ['a', 'b', 'c'],
  a: ['a1', 'a2'],
  a1: ['a1x', 'a1y'],
  b: ['b1', 'b2'],
  b2: ['b2x'],
  c: ['c1'],
});

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function randomCommand(random: () => number, state: PaperViewState, created: { n: number }): Command {
  const ids = [...state.paperMap.keys(), 'ghost'];
  const id = () => pick(random, ids);
  const roll = random();
  if (roll < 0.22) return { type: 'OPEN_NODE', parentId: id(), childId: id() };
  if (roll < 0.3) return { type: 'CLOSE_NODE', parentId: id(), childId: id() };
  if (roll < 0.36) return { type: 'FOCUS_NODE', nodeId: id() };
  if (roll < 0.42) return { type: 'REVEAL_NODE', nodeId: id() };
  if (roll < 0.52) return { type: 'MOVE_NODE', nodeId: id(), targetParentId: id(), insertBeforeId: random() < 0.5 ? null : id() };
  if (roll < 0.58) return { type: 'REORDER_WITHIN_PARENT', parentId: id(), paperId: id(), insertBeforeId: random() < 0.5 ? null : id() };
  if (roll < 0.63) return { type: 'DELETE_NODE', nodeId: id(), mode: random() < 0.5 ? 'cascade' : 'lift' };
  if (roll < 0.68) return { type: 'CREATE_CHILD_NODE', id: `n${(created.n += 1)}`, parentId: id(), title: 'n', description: '', content: '' };
  if (roll < 0.73) return { type: 'INDEX_CONTENT', nodeId: id() };
  if (roll < 0.77) return { type: 'UNINDEX_CONTENT', nodeId: id() };
  if (roll < 0.8) return { type: 'LABEL_CLICK_BOOST', nodeId: id() };
  if (roll < 0.84) return { type: 'PIN_NODE', nodeId: id(), minShare: random() };
  if (roll < 0.87) return { type: 'CLOSE_CHILDREN', nodeId: id() };
  if (roll < 0.9) return { type: 'AUTO_CLOSE_NODE', nodeId: id() };
  if (roll < 0.95) {
    // Open state from outside, possibly nonsense (cycles, ancestors, unknown ids).
    const entries: [PaperId, { openChildIds: PaperId[] }][] = [];
    for (let i = 0; i < 4; i += 1) entries.push([id(), { openChildIds: [id(), id()] }]);
    return { type: 'SET_OPEN_STATE', expansionMap: new Map(entries), focusedNodeId: random() < 0.5 ? id() : undefined };
  }
  // The host drops a random subtree from the map.
  const victim = pick(random, [...state.paperMap.keys()].filter((key) => key !== 'root'));
  if (!victim) return { type: 'FOCUS_NODE', nodeId: 'root' };
  const remove = new Set([victim, ...getDescendantIds(state.paperMap, victim)]);
  const next = new Map([...state.paperMap].filter(([key]) => !remove.has(key)));
  const parentId = state.paperMap.get(victim)?.parentId;
  const parent = parentId ? next.get(parentId) : undefined;
  if (parent && parentId) next.set(parentId, { ...parent, childIds: parent.childIds.filter((c) => c !== victim) });
  return { type: 'SET_PAPER_MAP', paperMap: next };
}

function assertInvariants(state: PaperViewState, step: number, command: Command) {
  const context = `step ${step}: ${JSON.stringify(command, (_k, v) => (v instanceof Map ? [...v] : v))}`;
  expect(checkTreeInvariants(state.paperMap, state.unplacedNodeIds), context).toEqual([]);
  expect(state.paperMap.has('root'), context).toBe(true);

  // Layout follows consistent edges only: every laid-out paper appears once, under its parent.
  const layout = computeCanvasLayout(state, config, 'root', { width: 1200, height: 800 });
  for (const [id, entry] of layout.entries) {
    for (const childId of entry.roomLayout.childRects.keys()) {
      expect(state.paperMap.get(childId)?.parentId, context).toBe(id);
    }
  }
  const visible = new Set<PaperId>(['root']);
  const stack: PaperId[] = ['root'];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const childId of getVisibleChildIds(state.paperMap, state.expansionMap, id)) {
      expect(visible.has(childId), context).toBe(false);
      visible.add(childId);
      stack.push(childId);
    }
  }

  // Id-keyed state never outlives its paper.
  for (const map of [state.attentionMap, state.attentionTimestampMap, state.accessMap, state.protectedUntilMap]) {
    for (const id of map.keys()) expect(state.paperMap.has(id), `${context} stale ${id}`).toBe(true);
  }
  for (const id of state.indexedContentIds) expect(state.paperMap.has(id), context).toBe(true);
  for (const id of state.unplacedNodeIds) expect(state.paperMap.get(id)?.parentId, context).toBeNull();
  expect(Number.isFinite(state.clock), context).toBe(true);
}

describe('reducer invariants under random command sequences', () => {
  // PIP_FUZZ_SEEDS=300 npx vitest run test/core/invariants.test.ts for a longer local run.
  const seedCount = Number(process.env.PIP_FUZZ_SEEDS ?? 8);
  for (const seed of Array.from({ length: seedCount }, (_, i) => i + 1)) {
    it(`seed ${seed}`, () => {
      const random = seededRandom(seed);
      const created = { n: 0 };
      let state = stateOf(BASE());
      for (let step = 0; step < 250; step += 1) {
        const command = randomCommand(random, state, created);
        state = reduce(state, command, config);
        if (step % 25 === 0) {
          state = settleSpace(state, config, 'root', { width: 500, height: 600 }, (s, c) => reduce(s, c, config)).state;
        }
        assertInvariants(state, step, command);
      }
    });
  }
});
