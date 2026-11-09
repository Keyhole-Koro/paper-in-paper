import { describe, expect, it } from 'vitest';
import { reduce, type Command } from '../../src/lib/core/commands';
import { computeCanvasLayout, type CanvasSize } from '../../src/lib/core/layout';
import { pickSpaceManagementCommand, settleSpace } from '../../src/lib/core/spaceManagement';
import type { PaperViewState } from '../../src/lib/core/types';
import { config, expansion, focus, makeConfig, open, openIds, run, stateOf, tree } from '../helpers/papers';

const SMALL: CanvasSize = { width: 320, height: 480 };
const LARGE: CanvasSize = { width: 1600, height: 1000 };

function settle(state: PaperViewState, size: CanvasSize, cfg = config) {
  return settleSpace(state, cfg, 'root', size, (s, c) => reduce(s, c, cfg));
}

/** Interactions elsewhere, enough to outlast every protection window. */
function ageProtection(state: PaperViewState): PaperViewState {
  let next = state;
  for (let i = 0; i < config.attention.protectInteractions + 1; i += 1) next = run(next, [focus('root')]);
  return next;
}

/** Opens `count` children of root, then lets their protection run out. */
function crowded(count: number) {
  const ids = Array.from({ length: count }, (_, i) => `p${i}`);
  const state = run(stateOf(tree({ root: ids })), ids.map((id) => open('root', id)));
  return ageProtection(state);
}

function cramped(state: PaperViewState, size: CanvasSize, cfg = config) {
  return computeCanvasLayout(state, cfg, 'root', size).entries.get('root')!.roomLayout.crampedChildIds;
}

describe('pickSpaceManagementCommand', () => {
  it('does nothing when every room has space', () => {
    const state = crowded(3);
    expect(cramped(state, LARGE)).toEqual([]);
    expect(pickSpaceManagementCommand(state, computeCanvasLayout(state, config, 'root', LARGE), config)).toBeNull();
  });

  it('indexes the least important paper when a room is cramped', () => {
    let state = crowded(5);
    state = run(state, [focus('p3'), focus('p4'), focus('p1'), focus('p2'), focus('root')]);
    expect(cramped(state, SMALL).length).toBeGreaterThan(0);
    const command = pickSpaceManagementCommand(state, computeCanvasLayout(state, config, 'root', SMALL), config);
    // p0 was never touched again: it has the least attention.
    expect(command).toEqual({ type: 'INDEX_CONTENT', nodeId: 'p0' });
  });

  it('never picks protected, pinned or focused papers', () => {
    let state = crowded(4);
    state = run(state, [
      { type: 'PIN_NODE', nodeId: 'p0', minShare: 0.1 },
      { type: 'PIN_NODE', nodeId: 'p1', minShare: 0.1 },
      open('root', 'p2'), // reopening protects it again
      focus('p3'),
    ]);
    const tiny = { width: 200, height: 200 };
    expect(cramped(state, tiny).length).toBeGreaterThan(0);
    expect(pickSpaceManagementCommand(state, computeCanvasLayout(state, config, 'root', tiny), config)).toBeNull();
  });

  it("does not take away a room's only paper", () => {
    const state = ageProtection(run(stateOf(tree({ root: ['a'] })), [open('root', 'a')]));
    const layout = computeCanvasLayout(state, config, 'root', { width: 150, height: 150 });
    expect(layout.entries.get('root')!.roomLayout.crampedChildIds).toEqual(['a']);
    expect(pickSpaceManagementCommand(state, layout, config)).toBeNull();
  });

  it('closes an indexed paper that still reserves room once nothing is left to index (stage 2)', () => {
    let state = run(stateOf(tree({ root: ['a', 'b'], a: ['a1'], b: ['b1'] })), [
      open('root', 'a'), open('root', 'b'), open('a', 'a1'), open('b', 'b1'),
    ]);
    state = ageProtection(run(state, [focus('b1')]));
    state = run(state, [{ type: 'INDEX_CONTENT', nodeId: 'a' }, { type: 'INDEX_CONTENT', nodeId: 'b' }]);
    const tiny = { width: 200, height: 220 };
    const layout = computeCanvasLayout(state, config, 'root', tiny);
    expect(layout.entries.get('a')!.policy.mode).toBe('indexed-branch');
    expect(layout.entries.get('root')!.roomLayout.crampedChildIds.length).toBeGreaterThan(0);
    // a was touched least recently.
    expect(pickSpaceManagementCommand(state, layout, config)).toEqual({ type: 'AUTO_CLOSE_NODE', nodeId: 'a' });
  });

  it('closes stale indexed leaves whose attention decayed to the threshold', () => {
    let state = crowded(2);
    state = run(state, [{ type: 'INDEX_CONTENT', nodeId: 'p1' }]);
    const cfg = makeConfig({ attention: { autoCloseThreshold: 60 } });
    for (let i = 0; i < 40; i += 1) state = run(state, [focus('p0')]);
    expect(pickSpaceManagementCommand(state, computeCanvasLayout(state, cfg, 'root', LARGE), cfg))
      .toEqual({ type: 'AUTO_CLOSE_NODE', nodeId: 'p1' });
    const off = makeConfig({ attention: { autoCloseThreshold: 0 } });
    expect(pickSpaceManagementCommand(state, computeCanvasLayout(state, off, 'root', LARGE), off)).toBeNull();
  });
});

describe('never hides what the reader is working with', () => {
  it('does not close a parent of the focused paper, even when the room stays cramped', () => {
    // Review repro: open A, F (inside A), B, then focus F on a small canvas.
    let state = stateOf(tree({ root: ['A', 'B'], A: ['F'] }));
    state = run(state, [open('root', 'A'), open('A', 'F'), open('root', 'B'), focus('F')]);
    // A's protection has run out; F (focused) and B (just opened) are still protected.
    const settled = settle(state, { width: 420, height: 380 });
    expect(settled.applied).toContainEqual({ type: 'INDEX_CONTENT', nodeId: 'A' });
    expect(settled.state.focusedNodeId).toBe('F');
    expect(openIds(settled.state, 'root')).toContain('A');
    expect(openIds(settled.state, 'A')).toEqual(['F']);
    expect(settled.applied.some((c) => c.type === 'AUTO_CLOSE_NODE' && c.nodeId === 'A')).toBe(false);
  });

  it('does not close a parent of a protected or pinned paper', () => {
    let state = stateOf(tree({ root: ['A', 'B'], A: ['F'] }));
    state = run(state, [open('root', 'A'), open('A', 'F'), open('root', 'B')]);
    state = ageProtection(state);
    state = run(state, [{ type: 'PIN_NODE', nodeId: 'F', minShare: 0.2 }, { type: 'INDEX_CONTENT', nodeId: 'A' }, { type: 'INDEX_CONTENT', nodeId: 'B' }]);
    const tiny = { width: 200, height: 220 };
    expect(pickSpaceManagementCommand(state, computeCanvasLayout(state, config, 'root', tiny), config)).toBeNull();
  });
});

describe('settleSpace', () => {
  it('resolves a cramped room in one go and leaves a settled state', () => {
    const state = crowded(6);
    const settled = settle(state, SMALL);
    expect(settled.applied.length).toBeGreaterThan(0);
    expect(settled.applied.every((c: Command) => c.type === 'INDEX_CONTENT' || c.type === 'AUTO_CLOSE_NODE')).toBe(true);
    expect(pickSpaceManagementCommand(settled.state, settled.layout, config)).toBeNull();
    // Settling again changes nothing: there is no oscillation.
    const again = settle(settled.state, SMALL);
    expect(again.applied).toEqual([]);
    expect(again.state).toBe(settled.state);
  });

  it('closes indexed branches when indexing alone is not enough, but keeps one paper open', () => {
    const ids = ['a', 'b', 'c'];
    let state = stateOf(tree({ root: ids, a: ['a1'], b: ['b1'], c: ['c1'] }));
    state = run(state, [...ids.map((id) => open('root', id)), open('a', 'a1'), open('b', 'b1'), open('c', 'c1')]);
    state = ageProtection(state);
    const settled = settle(state, { width: 200, height: 300 });
    expect(settled.applied.some((c) => c.type === 'AUTO_CLOSE_NODE')).toBe(true);
    expect(openIds(settled.state, 'root').length).toBeGreaterThanOrEqual(1);
    expect(pickSpaceManagementCommand(settled.state, settled.layout, config)).toBeNull();
  });

  it('does nothing without a canvas size', () => {
    const state = crowded(6);
    const settled = settle(state, { width: 0, height: 0 });
    expect(settled.state).toBe(state);
    expect(settled.applied).toEqual([]);
  });

  it('leaves restored open state alone until the reader interacts', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const state = stateOf(tree({ root: ids }), { expansionMap: expansion({ root: ids }) });
    expect(cramped(state, SMALL).length).toBeGreaterThan(0);
    expect(settle(state, SMALL).applied).toEqual([]);
  });
});
