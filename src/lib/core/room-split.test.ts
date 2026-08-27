import { describe, expect, it } from 'vitest';
import { defaultPaperCanvasConfig } from '../config/paperCanvasConfig';
import { selectLowImportanceCandidates } from './candidates';
import { createInitialState, reduce } from './commands';
import { computeNodeLayout } from './layout';
import { CONTENT_ITEM_ID, MIN_PANE_RATIO, reconcileRoomSplit, type RoomSplit } from './roomSplit';
import { buildPaperMap } from './tree';
import type { Paper, PaperViewState } from './types';

const config = defaultPaperCanvasConfig;
const ROOM_W = 1000;
const ROOM_H = 600;

function buildState(papers: Paper[], openChildIds: Record<string, string[]> = {}) {
  const state = createInitialState(buildPaperMap(papers), config);
  for (const [parentId, ids] of Object.entries(openChildIds)) {
    state.expansionMap.set(parentId, { openChildIds: ids, openChildSet: new Set(ids) });
  }
  return state;
}

function room(childIds: string[]) {
  return buildState(
    [
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds },
      ...childIds.map((id) => ({ id, title: id, description: '', content: '', parentId: 'root', childIds: [] })),
    ],
    { root: childIds },
  );
}

function layoutRoom(state: PaperViewState, w = ROOM_W, h = ROOM_H) {
  return computeNodeLayout(
    'root', w, h,
    state.paperMap, state.expansionMap, state.attentionMap, state.attentionTimestampMap,
    state.accessMap, state.contentHeightMap, state.indexedContentIds, config,
    undefined, undefined, 1_000, undefined, state.roomSplitMap,
  );
}

/** Replays what a grip does: read a divider off the layout and drag it by `px`. */
function dragDivider(state: PaperViewState, itemId: string, edge: 'left' | 'right' | 'top' | 'bottom', px: number) {
  const layout = layoutRoom(state);
  const divider = layout.dividers.get(itemId)?.[edge];
  if (!divider || !layout.split) throw new Error(`no ${edge} divider on ${itemId}`);
  return reduce(
    state,
    {
      type: 'RESIZE_SPLIT',
      roomId: 'root',
      split: layout.split,
      target: divider.target,
      ratio: divider.ratio + px / divider.pairExtentPx,
    },
    config,
  );
}

function rectOf(state: PaperViewState, id: string) {
  const layout = layoutRoom(state);
  return id === CONTENT_ITEM_ID ? layout.contentRect : layout.childRects.get(id)!;
}

describe('room split', () => {
  it('proposes a split that reproduces the packed layout exactly', () => {
    const layout = layoutRoom(room(['a', 'b', 'c']));
    expect(layout.isManualSplit).toBe(false);
    expect(layout.split).not.toBeNull();

    // Every rect the packer produced is covered by the split, and the panes
    // tile the room without gaps or overlap.
    const rects = [layout.contentRect, ...layout.childRects.values()];
    const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
    expect(area).toBeCloseTo(ROOM_W * ROOM_H, 3);
    for (const rect of rects) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }
  });

  it('keeps the 2D arrangement instead of collapsing to one strip', () => {
    // Six children pack into several rows; hand-arranging must not flatten it.
    const state = dragDivider(room(['a', 'b', 'c', 'd', 'e', 'f']), 'a', 'right', 30);
    const layout = layoutRoom(state);
    expect(layout.isManualSplit).toBe(true);

    // Panes stacked inside a row is what a 2D arrangement looks like; a single
    // strip would put every pane at y = 0.
    const rects = [...layout.childRects.values()];
    expect(rects.some((rect) => rect.y > 0.5)).toBe(true);
  });

  it('moves the dragged divider by exactly the drag distance', () => {
    const base = room(['a', 'b']);
    const layout = layoutRoom(base);
    const divider = layout.dividers.get('a')?.right ?? layout.dividers.get('a')?.bottom;
    expect(divider).toBeDefined();

    const before = rectOf(base, 'a');
    const edge = layout.dividers.get('a')?.right ? 'right' : 'bottom';
    const state = dragDivider(base, 'a', edge, 60);
    const after = rectOf(state, 'a');

    if (edge === 'right') expect(after.width - before.width).toBeCloseTo(60, 3);
    else expect(after.height - before.height).toBeCloseTo(60, 3);
  });

  it('leaves every other pane alone when a pane divider moves', () => {
    const base = room(['a', 'b', 'c', 'd']);
    const layout = layoutRoom(base);

    // Find a divider between two panes inside a row — a row divider moves whole
    // rows by design, so it is not the case under test here.
    let found: { id: string; edge: 'left' | 'right' | 'top' | 'bottom' } | null = null;
    for (const [id, edges] of layout.dividers) {
      for (const edge of ['right', 'bottom'] as const) {
        if (edges[edge]?.target.kind === 'item') found = { id, edge };
        if (found) break;
      }
      if (found) break;
    }
    expect(found).not.toBeNull();

    const pair = new Set([found!.id]);
    const rowIndex = (layout.dividers.get(found!.id)![found!.edge] as { target: { kind: 'item'; row: number; index: number } }).target;
    const rowItems = layout.split!.rows[rowIndex.row].items;
    pair.add(rowItems[rowIndex.index].id);
    pair.add(rowItems[rowIndex.index + 1].id);

    const untouched = [...layout.childRects.keys()].filter((id) => !pair.has(id));
    const before = new Map(untouched.map((id) => [id, rectOf(base, id)]));

    const state = dragDivider(base, found!.id, found!.edge, 40);
    for (const id of untouched) {
      const a = before.get(id)!;
      const b = rectOf(state, id);
      expect(b.width).toBeCloseTo(a.width, 3);
      expect(b.height).toBeCloseTo(a.height, 3);
    }
  });

  it('both grips on a divider move the same line', () => {
    const base = room(['a', 'b']);
    const layout = layoutRoom(base);
    const edges = layout.dividers.get('a')!;
    const edge = edges.right ? 'right' : 'bottom';
    const opposite = edge === 'right' ? 'left' : 'top';
    const neighbour = [...layout.childRects.keys()].find(
      (id) => id !== 'a' && layout.dividers.get(id)?.[opposite],
    );
    expect(neighbour).toBeDefined();

    const fromA = rectOf(dragDivider(base, 'a', edge, 50), 'a');
    const fromNeighbour = rectOf(dragDivider(base, neighbour!, opposite, 50), 'a');
    expect(fromNeighbour.width).toBeCloseTo(fromA.width, 3);
    expect(fromNeighbour.height).toBeCloseTo(fromA.height, 3);
  });

  it('holds a hand-set arrangement while siblings change around it', () => {
    let state = room(['a', 'b', 'c']);
    const edge = layoutRoom(state).dividers.get('a')?.right ? 'right' : 'bottom';
    state = dragDivider(state, 'a', edge, 45);
    const held = rectOf(state, 'a');

    state = reduce(state, { type: 'FOCUS_NODE', nodeId: 'b' }, config);
    state = reduce(state, { type: 'FOCUS_NODE', nodeId: 'b' }, config);
    expect(rectOf(state, 'a').width).toBeCloseTo(held.width, 3);
    expect(rectOf(state, 'a').height).toBeCloseTo(held.height, 3);

    state = reduce(state, { type: 'CLOSE_NODE', parentId: 'root', childId: 'c' }, config);
    const afterClose = rectOf(state, 'a');
    state = reduce(state, { type: 'OPEN_NODE', parentId: 'root', childId: 'c' }, config);
    expect(rectOf(state, 'a').width).toBeGreaterThan(0);
    expect(afterClose.width).toBeGreaterThan(0);
  });

  it('gives the room back to the packer on reset', () => {
    const base = room(['a', 'b', 'c']);
    const before = rectOf(base, 'a');
    let state = dragDivider(base, 'a', layoutRoom(base).dividers.get('a')?.right ? 'right' : 'bottom', 60);
    expect(layoutRoom(state).isManualSplit).toBe(true);

    state = reduce(state, { type: 'RESET_ROOM_SPLIT', roomId: 'root' }, config);
    expect(layoutRoom(state).isManualSplit).toBe(false);
    expect(rectOf(state, 'a').width).toBeCloseTo(before.width, 3);
    expect(rectOf(state, 'a').height).toBeCloseTo(before.height, 3);
  });

  it('never collapses a pane past the floor', () => {
    const base = room(['a', 'b']);
    const edge = layoutRoom(base).dividers.get('a')?.right ? 'right' : 'bottom';
    const state = dragDivider(base, 'a', edge, -10_000);
    const rect = rectOf(state, 'a');
    expect(Math.min(rect.width, rect.height)).toBeGreaterThan(0);
    expect(rect.width * rect.height).toBeGreaterThan(ROOM_W * ROOM_H * MIN_PANE_RATIO * 0.5);
  });

  it('stands the space manager down for a hand-arranged room', () => {
    const state = dragDivider(room(['a', 'b', 'c']), 'a', 'right', 20);
    expect(layoutRoom(state).overflowChildCount).toBe(0);
    expect(selectLowImportanceCandidates(state, 'root', Date.now(), config)).toEqual([]);
  });

  it('drops departed items and adopts new ones when reconciling', () => {
    const split: RoomSplit = {
      axis: 'vertical',
      rows: [
        { weight: 0.5, items: [{ id: 'a', weight: 0.5 }, { id: 'b', weight: 0.5 }] },
        { weight: 0.5, items: [{ id: 'c', weight: 1 }] },
      ],
    };

    const withoutB = reconcileRoomSplit(split, ['a', 'c']);
    expect(withoutB!.rows[0].items.map((i) => i.id)).toEqual(['a']);
    expect(withoutB!.rows[0].items[0].weight).toBeCloseTo(1, 6);

    const withD = reconcileRoomSplit(split, ['a', 'b', 'c', 'd']);
    expect(withD!.rows).toHaveLength(3);
    expect(withD!.rows[2].items.map((i) => i.id)).toEqual(['d']);
    expect(withD!.rows.reduce((sum, r) => sum + r.weight, 0)).toBeCloseTo(1, 6);

    expect(reconcileRoomSplit(split, [])).toBeNull();
  });

  it('forgets the split of a deleted room', () => {
    let state = buildState(
      [
        { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a'] },
        { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: ['x', 'y'] },
        { id: 'x', title: 'x', description: '', content: '', parentId: 'a', childIds: [] },
        { id: 'y', title: 'y', description: '', content: '', parentId: 'a', childIds: [] },
      ],
      { root: ['a'], a: ['x', 'y'] },
    );
    state = reduce(
      state,
      { type: 'RESIZE_SPLIT', roomId: 'a', split: { axis: 'vertical', rows: [{ weight: 1, items: [{ id: 'x', weight: 0.5 }, { id: 'y', weight: 0.5 }] }] }, target: { kind: 'item', row: 0, index: 0 }, ratio: 0.7 },
      config,
    );
    expect(state.roomSplitMap.has('a')).toBe(true);

    state = reduce(state, { type: 'DELETE_NODE', nodeId: 'a' }, config);
    expect(state.roomSplitMap.has('a')).toBe(false);
  });
});
