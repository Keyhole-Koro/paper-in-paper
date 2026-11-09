import { describe, expect, it } from 'vitest';
import {
  buildDemandSnapshot,
  computeCanvasLayout,
  computeNodeLayout,
  computeRoomLayout,
  normalizeShares,
  snapRects,
  type LayoutRect,
} from '../../src/lib/core/layout';
import type { PaperViewState } from '../../src/lib/core/types';
import { config, expansion, makeConfig, open, run, stateOf, tree } from '../helpers/papers';

function overlaps(a: LayoutRect, b: LayoutRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function expectTiling(rects: LayoutRect[], width: number, height: number) {
  const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
  expect(area).toBeCloseTo(width * height, 0);
  for (const r of rects) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width).toBeLessThanOrEqual(width + 1e-6);
    expect(r.y + r.height).toBeLessThanOrEqual(height + 1e-6);
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) expect(overlaps(rects[i], rects[j])).toBe(false);
  }
}

describe('computeRoomLayout', () => {
  it('tiles the container exactly, in item order, for many weight mixes', () => {
    const cases = [[1], [1, 1], [3, 1, 1], [5, 1, 1, 1, 1, 1], [0.2, 0.3, 0.5], [10, 1]];
    for (const weights of cases) {
      for (const [w, h] of [[1200, 800], [400, 900], [500, 500]]) {
        const items = weights.map((weight, i) => ({ id: `i${i}`, weight }));
        const { rects } = computeRoomLayout(items, w, h);
        expect(rects.map((r) => r.id)).toEqual(items.map((i) => i.id));
        expectTiling(rects, w, h);
      }
    }
  });

  it('gives areas proportional to weight', () => {
    const { rects } = computeRoomLayout([{ id: 'a', weight: 3 }, { id: 'b', weight: 1 }], 800, 400);
    expect((rects[0].width * rects[0].height) / (rects[1].width * rects[1].height)).toBeCloseTo(3);
  });

  it('gives zero-weight items an empty rect instead of NaN', () => {
    const { rects } = computeRoomLayout([{ id: 'a', weight: 1 }, { id: 'z', weight: 0 }, { id: 'b', weight: 1 }], 600, 400);
    expect(rects.map((r) => r.id)).toEqual(['a', 'z', 'b']);
    for (const r of rects) for (const v of [r.x, r.y, r.width, r.height]) expect(Number.isNaN(v)).toBe(false);
    expect(rects[1]).toMatchObject({ width: 0, height: 0 });
  });

  it('returns nothing for empty input or an empty container', () => {
    expect(computeRoomLayout([], 100, 100).rects).toEqual([]);
    expect(computeRoomLayout([{ id: 'a', weight: 1 }], 0, 100).rects).toEqual([]);
    expect(computeRoomLayout([{ id: 'a', weight: 0 }], 100, 100).rects).toEqual([]);
  });
});

describe('snapRects', () => {
  it('rounds edges so neighbours still share them', () => {
    const { rects } = computeRoomLayout([1, 1, 1].map((weight, i) => ({ id: `i${i}`, weight })), 1000, 333);
    const snapped = snapRects(rects);
    for (const r of snapped) {
      expect(Number.isInteger(r.x) && Number.isInteger(r.width)).toBe(true);
    }
    expectTiling(snapped, 1000, 333);
  });
});

describe('normalizeShares', () => {
  it('sums to 1 and respects minimum shares', () => {
    const shares = normalizeShares([
      { id: 'big', demand: 1000, minShare: 0 },
      { id: 'small', demand: 1, minShare: 0.25 },
    ]);
    expect((shares.get('big') ?? 0) + (shares.get('small') ?? 0)).toBeCloseTo(1);
    expect(shares.get('small')).toBeGreaterThanOrEqual(0.25);
  });

  it('scales minimums down together when they add up past 1', () => {
    const shares = normalizeShares([
      { id: 'a', demand: 1, minShare: 0.8 },
      { id: 'b', demand: 1, minShare: 0.8 },
    ]);
    expect(shares.get('a')).toBeCloseTo(0.5);
  });
});

function layoutOf(state: PaperViewState, width = 1200, height = 800, cfg = config) {
  return computeCanvasLayout(state, cfg, 'root', { width, height });
}

describe('demand', () => {
  it('gives long content more room than short content', () => {
    const long = '<p>' + 'word '.repeat(800) + '</p>';
    const map = tree({ root: ['short', 'long'] }, { short: { content: '<p>hi</p>' }, long: { content: long } });
    const state = stateOf(map, { expansionMap: expansion({ root: ['short', 'long'] }) });
    const room = layoutOf(state).entries.get('root')!.roomLayout;
    const area = (id: string) => room.childRects.get(id)!.width * room.childRects.get(id)!.height;
    expect(area('long')).toBeGreaterThan(area('short') * 1.5);
  });

  it("'uniform' content demand ignores content length", () => {
    const map = tree({ root: ['short', 'long'] }, { short: { content: 'hi' }, long: { content: 'x'.repeat(5000) } });
    const cfg = makeConfig({ layout: { contentDemand: 'uniform' } });
    const state = stateOf(map, { expansionMap: expansion({ root: ['short', 'long'] }) }, cfg);
    const demand = buildDemandSnapshot(state, cfg, 'root');
    expect(demand.contentDemandMap.get('short')).toBe(demand.contentDemandMap.get('long'));
  });

  it('weighs siblings by importance and content by contentImportance', () => {
    const map = tree({ root: ['a', 'b'] }, { a: { importance: 3 }, root: { contentImportance: 0 } });
    const state = stateOf(map, { expansionMap: expansion({ root: ['a', 'b'] }) });
    const room = layoutOf(state).entries.get('root')!.roomLayout;
    expect(room.contentRect.width * room.contentRect.height).toBe(0);
    const area = (id: string) => room.childRects.get(id)!.width * room.childRects.get(id)!.height;
    expect(area('a')).toBeGreaterThan(area('b') * 2);
  });

  it('honours childMinShares and pinned minimum shares', () => {
    const map = tree({ root: ['a', 'b', 'c'] }, { root: { childMinShares: { c: 0.5 } }, b: { pinnedLayout: { minShare: 0.3 } } });
    const state = stateOf(map, { expansionMap: expansion({ root: ['a', 'b', 'c'] }) });
    const room = layoutOf(state).entries.get('root')!.roomLayout;
    const total = 1198 * (800 - 37 - 2);
    const share = (id: string) => (room.childRects.get(id)!.width * room.childRects.get(id)!.height) / total;
    expect(share('c')).toBeGreaterThanOrEqual(0.49);
    expect(share('b')).toBeGreaterThanOrEqual(0.29);
  });

  it('lets a custom layout function split the room, and falls back when it throws', () => {
    const map = tree({ root: ['a', 'b'] }, {
      root: { layout: ({ openChildIds }) => ({ contentShare: 0.1, childShares: { [openChildIds[0]]: 0.6 } }) },
    });
    const state = stateOf(map, { expansionMap: expansion({ root: ['a', 'b'] }) });
    const room = layoutOf(state).entries.get('root')!.roomLayout;
    const area = (r: LayoutRect) => r.width * r.height;
    const total = area(room.contentRect) + area(room.childRects.get('a')!) + area(room.childRects.get('b')!);
    expect(area(room.childRects.get('a')!) / total).toBeCloseTo(0.6, 1);
    expect(area(room.childRects.get('b')!) / total).toBeCloseTo(0.3, 1);

    // A layout that leaves a child out with nothing left over: that child gets no room, not NaN.
    const greedy = tree({ root: ['a', 'b'] }, { root: { layout: () => ({ contentShare: 0.5, childShares: { a: 0.5 } }) } });
    const greedyRoom = layoutOf(stateOf(greedy, { expansionMap: expansion({ root: ['a', 'b'] }) })).entries.get('root')!.roomLayout;
    expect(greedyRoom.childRects.get('b')).toMatchObject({ width: 0, height: 0 });
    expect(greedyRoom.crampedChildIds).toContain('b');

    const throwing = tree({ root: ['a'] }, { root: { layout: () => { throw new Error('boom'); } } });
    const fallback = layoutOf(stateOf(throwing, { expansionMap: expansion({ root: ['a'] }) }));
    expect(fallback.entries.get('root')!.roomLayout.childRects.get('a')!.width).toBeGreaterThan(0);
  });
});

describe('computeCanvasLayout', () => {
  it('lays out only consistent open edges, so bad open state can neither loop nor duplicate', () => {
    const map = tree({ root: ['a', 'b'], a: ['a1'], b: ['b1'] });
    const state = stateOf(map, { expansionMap: expansion({ root: ['a', 'b'], a: ['a1', 'root', 'b1', 'ghost'], a1: ['a'] }) });
    const layout = layoutOf(state);
    expect([...layout.entries.keys()]).toEqual(['root', 'a', 'a1', 'b']);
    expect([...layout.entries.get('a')!.roomLayout.childRects.keys()]).toEqual(['a1']);
  });

  it('lays out a restored cycle without overflowing the stack, even before the papers load', () => {
    const state = stateOf(tree({ root: ['ws'] }), { expansionMap: expansion({ root: ['ws'], ws: ['item'], item: ['ws'] }) });
    expect(() => layoutOf(state)).not.toThrow();
  });

  it('is empty without a root, an unknown root, or an empty canvas', () => {
    const state = stateOf(tree({ root: ['a'] }));
    expect(computeCanvasLayout(state, config, null, { width: 100, height: 100 }).entries.size).toBe(0);
    expect(computeCanvasLayout(state, config, 'nope', { width: 100, height: 100 }).entries.size).toBe(0);
    expect(computeCanvasLayout(state, config, 'root', { width: 0, height: 100 }).entries.size).toBe(0);
  });

  it('is deterministic and keeps entry identity when nothing changed', () => {
    const state = run(stateOf(tree({ root: ['a', 'b'], a: ['a1'] })), [open('root', 'a'), open('root', 'b'), open('a', 'a1')]);
    const first = layoutOf(state);
    const again = computeCanvasLayout(state, config, 'root', { width: 1200, height: 800 }, first);
    for (const [id, entry] of first.entries) expect(again.entries.get(id)).toBe(entry);
  });

  it('keeps entries of papers whose layout did not change across a state change', () => {
    const map = tree({ root: ['a', 'b'] }, { root: { layout: () => ({ contentShare: 0.5, childShares: { a: 0.25, b: 0.25 } }) } });
    const state = run(stateOf(map), [open('root', 'a'), open('root', 'b')]);
    const before = layoutOf(state);
    const after = computeCanvasLayout(run(state, [{ type: 'FOCUS_NODE', nodeId: 'a' }]), config, 'root', { width: 1200, height: 800 }, before);
    expect(after.entries.get('b')).toBe(before.entries.get('b'));
  });

  it('marks children below the minimum size as cramped', () => {
    const map = tree({ root: ['a', 'b', 'c', 'd'] });
    const state = stateOf(map, { expansionMap: expansion({ root: ['a', 'b', 'c', 'd'] }) });
    expect(layoutOf(state, 1600, 1000).entries.get('root')!.roomLayout.crampedChildIds).toEqual([]);
    expect(layoutOf(state, 360, 640).entries.get('root')!.roomLayout.crampedChildIds.length).toBeGreaterThan(0);
    const roomy = stateOf(tree({ root: ['a', 'b'] }, { a: { minWidth: 2000 } }), { expansionMap: expansion({ root: ['a', 'b'] }) });
    expect(layoutOf(roomy).entries.get('root')!.roomLayout.crampedChildIds).toContain('a');
  });

  it('gives indexed leaves no room and indexed branches room for their children only', () => {
    let state = run(stateOf(tree({ root: ['a', 'b'], a: ['a1'] })), [open('root', 'a'), open('root', 'b'), open('a', 'a1')]);
    state = run(state, [{ type: 'INDEX_CONTENT', nodeId: 'a' }, { type: 'INDEX_CONTENT', nodeId: 'b' }]);
    const layout = layoutOf(state);
    expect(layout.entries.get('a')!.policy.mode).toBe('indexed-branch');
    expect(layout.entries.get('a')!.roomLayout.contentRect.width).toBe(0);
    expect(layout.entries.get('a1')!.allocatedRect.width).toBeGreaterThan(0);
    expect(layout.entries.get('b')!.policy.mode).toBe('indexed-leaf');
    expect(layout.entries.get('root')!.roomLayout.childRects.get('b')).toMatchObject({ width: 0, height: 0 });
  });

  it('computeNodeLayout lays out one room on its own', () => {
    const state = run(stateOf(tree({ root: ['a'] })), [open('root', 'a')]);
    const room = computeNodeLayout('root', 600, 400, state, config);
    expect(room.childRects.get('a')!.width).toBeGreaterThan(0);
    expect(room.closedChildIds).toEqual([]);
    expect(computeNodeLayout('nope', 600, 400, state, config).childRects.size).toBe(0);
  });
});
