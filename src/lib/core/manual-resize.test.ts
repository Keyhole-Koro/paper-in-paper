import { describe, expect, it } from 'vitest';
import { defaultPaperCanvasConfig } from '../config/paperCanvasConfig';
import { selectLowImportanceCandidates } from './candidates';
import { createInitialState, reduce } from './commands';
import { computeNodeLayout } from './layout';
import { MAX_MANUAL_SHARE, MAX_MANUAL_SHARE_TOTAL, MIN_MANUAL_SHARE } from './manualSize';
import { buildPaperMap } from './tree';
import type { Paper, PaperViewState } from './types';

const config = defaultPaperCanvasConfig;

function buildState(papers: Paper[], openChildIds: Record<string, string[]> = {}) {
  const state = createInitialState(buildPaperMap(papers), config);
  for (const [parentId, ids] of Object.entries(openChildIds)) {
    state.expansionMap.set(parentId, { openChildIds: ids, openChildSet: new Set(ids) });
  }
  return state;
}

function twoChildren() {
  return buildState(
    [
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a', 'b'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [] },
      { id: 'b', title: 'b', description: '', content: '', parentId: 'root', childIds: [] },
    ],
    { root: ['a', 'b'] },
  );
}

function threeChildren() {
  return buildState(
    [
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a', 'b', 'c'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [] },
      { id: 'b', title: 'b', description: '', content: '', parentId: 'root', childIds: [] },
      { id: 'c', title: 'c', description: '', content: '', parentId: 'root', childIds: [] },
    ],
    { root: ['a', 'b', 'c'] },
  );
}

const ROOM_W = 1000;
const ROOM_H = 600;

function layoutRoom(state: PaperViewState, nodeId = 'root') {
  return computeNodeLayout(
    nodeId,
    ROOM_W,
    ROOM_H,
    state.paperMap,
    state.expansionMap,
    state.attentionMap,
    state.attentionTimestampMap,
    state.accessMap,
    state.contentHeightMap,
    state.indexedContentIds,
    config,
    undefined,
    undefined,
    1_000,
    undefined,
    state.manualSizeMap,
    state.manualContentSizeMap,
  );
}

function areaShare(rect: { width: number; height: number } | undefined) {
  if (!rect) return 0;
  return (rect.width * rect.height) / (ROOM_W * ROOM_H);
}

describe('manual resize', () => {
  it('gives a manually resized child exactly the share the user dragged to', () => {
    const state = reduce(threeChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: 0.5 }, config);
    const layout = layoutRoom(state);

    expect(areaShare(layout.childRects.get('a'))).toBeCloseTo(0.5, 4);
    // The remainder goes to the demand-driven items: the two siblings plus
    // the room's own content area.
    const remainder =
      areaShare(layout.contentRect) +
      areaShare(layout.childRects.get('b')) +
      areaShare(layout.childRects.get('c'));
    expect(remainder).toBeCloseTo(0.5, 4);
  });

  it('keeps the manual share stable when a sibling attention changes', () => {
    let state = reduce(threeChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: 0.4 }, config);
    const before = areaShare(layoutRoom(state).childRects.get('a'));

    state = reduce(state, { type: 'FOCUS_NODE', nodeId: 'b' }, config);
    state = reduce(state, { type: 'FOCUS_NODE', nodeId: 'b' }, config);

    expect(areaShare(layoutRoom(state).childRects.get('a'))).toBeCloseTo(before, 4);
  });

  it('resizes the content area against its own children', () => {
    const state = reduce(
      buildState(
        [
          { id: 'root', title: 'root', description: '', content: 'body', parentId: null, childIds: ['a'] },
          { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [] },
        ],
        { root: ['a'] },
      ),
      { type: 'RESIZE_CONTENT', nodeId: 'root', share: 0.7 },
      config,
    );

    expect(areaShare(layoutRoom(state).contentRect)).toBeCloseTo(0.7, 4);
  });

  it('clamps a manual share into the allowed range', () => {
    const tiny = reduce(threeChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: 0.001 }, config);
    const huge = reduce(threeChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: 5 }, config);

    expect(tiny.manualSizeMap.get('a')).toBe(MIN_MANUAL_SHARE);
    expect(huge.manualSizeMap.get('a')).toBe(MAX_MANUAL_SHARE);
  });

  it('scales manual shares down proportionally so demand-driven siblings keep room', () => {
    let state = threeChildren();
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'a', share: 0.6 }, config);
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'b', share: 0.6 }, config);
    const layout = layoutRoom(state);

    const a = areaShare(layout.childRects.get('a'));
    const b = areaShare(layout.childRects.get('b'));
    expect(a + b).toBeCloseTo(MAX_MANUAL_SHARE_TOTAL, 3);
    expect(a).toBeCloseTo(b, 4);
    expect(areaShare(layout.childRects.get('c'))).toBeGreaterThan(0);
  });

  it('lets manual shares fill the whole room when nothing else competes', () => {
    let state = buildState(
      [
        { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a', 'b'] },
        { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [] },
        { id: 'b', title: 'b', description: '', content: '', parentId: 'root', childIds: [] },
      ],
      { root: ['a', 'b'] },
    );
    // Indexing the room's own content leaves the two manually sized children
    // as the only items, so the ceiling on manual shares lifts to the room.
    state.indexedContentIds.add('root');
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'a', share: 0.75 }, config);
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'b', share: 0.25 }, config);
    const layout = layoutRoom(state);

    expect(areaShare(layout.contentRect)).toBe(0);
    expect(areaShare(layout.childRects.get('a'))).toBeCloseTo(0.75, 4);
    expect(areaShare(layout.childRects.get('b'))).toBeCloseTo(0.25, 4);
  });

  it('restores demand-driven sizing on reset', () => {
    const base = threeChildren();
    const resized = reduce(base, { type: 'RESIZE_NODE', nodeId: 'a', share: 0.6 }, config);
    const reset = reduce(resized, { type: 'RESET_NODE_SIZE', nodeId: 'a' }, config);

    expect(reset.manualSizeMap.has('a')).toBe(false);
    expect(areaShare(layoutRoom(reset).childRects.get('a'))).toBeCloseTo(
      areaShare(layoutRoom(base).childRects.get('a')),
      4,
    );
  });

  it('protects a resized node from the overflow heuristic', () => {
    const state = reduce(threeChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: 0.6 }, config);
    expect(state.protectedUntilMap.get('a')).toBeGreaterThan(Date.now());
  });

  it('never picks a manually sized node as an auto-index candidate', () => {
    let state = threeChildren();
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'a', share: 0.6 }, config);
    // Past the protection window, so only the manual size can exclude it.
    state = { ...state, protectedUntilMap: new Map() };

    const candidates = selectLowImportanceCandidates(state, 'root', Date.now(), config);
    expect(candidates).not.toContain('a');
    expect(candidates).toContain('b');
  });

  it('splits a hand-sized room along one axis so a dragged edge stays put', () => {
    const state = reduce(twoChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: 0.5 }, config);
    const layout = layoutRoom(state);
    const rects = [layout.contentRect, ...layout.childRects.values()];

    // The room is wider than tall, so every rect becomes a full-height column
    // and the columns tile it left to right with no gaps.
    for (const rect of rects) {
      expect(rect.height).toBeCloseTo(ROOM_H, 4);
      expect(rect.y).toBeCloseTo(0, 4);
    }
    let edge = 0;
    for (const rect of rects.slice().sort((p, q) => p.x - q.x)) {
      expect(rect.x).toBeCloseTo(edge, 4);
      edge += rect.width;
    }
    expect(edge).toBeCloseTo(ROOM_W, 4);
  });

  it('stacks a hand-sized room that is taller than it is wide', () => {
    const state = reduce(twoChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: 0.5 }, config);
    const layout = computeNodeLayout(
      'root', 400, 900,
      state.paperMap, state.expansionMap, state.attentionMap, state.attentionTimestampMap,
      state.accessMap, state.contentHeightMap, state.indexedContentIds, config,
      undefined, undefined, 1_000, undefined, state.manualSizeMap, state.manualContentSizeMap,
    );
    for (const rect of [layout.contentRect, ...layout.childRects.values()]) {
      expect(rect.width).toBeCloseTo(400, 4);
      expect(rect.x).toBeCloseTo(0, 4);
    }
  });

  it('keeps the dragged edge under the pointer instead of re-packing', () => {
    let state = reduce(twoChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: 0.3 }, config);
    const before = layoutRoom(state).childRects.get('a')!;

    // Replay what a drag does: widen the rect by 120px and ask for that area.
    const targetWidth = before.width + 120;
    const targetShare = (targetWidth * before.height) / (ROOM_W * ROOM_H);
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'a', share: targetShare }, config);
    const after = layoutRoom(state).childRects.get('a')!;

    expect(after.width).toBeCloseTo(targetWidth, 3);
    expect(after.height).toBeCloseTo(before.height, 3);
  });

  it('keeps the packer for a hand-sized room with too many items to strip', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    let state = buildState(
      [
        { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ids },
        ...ids.map((id) => ({ id, title: id, description: '', content: '', parentId: 'root', childIds: [] })),
      ],
      { root: ids },
    );
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'a', share: 0.2 }, config);

    // A single-axis room puts every rect at y = 0; a packed one does not.
    const rects = [...layoutRoom(state).childRects.values()];
    expect(rects.some((rect) => rect.y > 0.5)).toBe(true);
  });

  it('does not report overflow for the narrow columns the user asked for', () => {
    // 0.05 of a 1000x600 room is a 50px column — far outside the aspect-ratio
    // bounds, and previously enough to trigger auto-indexing of the siblings.
    const state = reduce(twoChildren(), { type: 'RESIZE_NODE', nodeId: 'a', share: MIN_MANUAL_SHARE }, config);
    expect(layoutRoom(state).overflowChildCount).toBe(0);
  });

  it('ignores a resize of the root, which has no siblings to trade with', () => {
    const state = threeChildren();
    expect(reduce(state, { type: 'RESIZE_NODE', nodeId: 'root', share: 0.5 }, config)).toBe(state);
  });

  it('drops the manual share when a node moves to another parent', () => {
    let state = buildState(
      [
        { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a', 'b'] },
        { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [] },
        { id: 'b', title: 'b', description: '', content: '', parentId: 'root', childIds: [] },
      ],
      { root: ['a', 'b'] },
    );
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'a', share: 0.6 }, config);
    state = reduce(state, { type: 'MOVE_NODE', nodeId: 'a', targetParentId: 'b', insertBeforeId: null }, config);

    expect(state.manualSizeMap.has('a')).toBe(false);
  });

  it('drops the manual share of deleted nodes', () => {
    let state = threeChildren();
    state = reduce(state, { type: 'RESIZE_NODE', nodeId: 'a', share: 0.6 }, config);
    state = reduce(state, { type: 'DELETE_NODE', nodeId: 'a' }, config);

    expect(state.manualSizeMap.has('a')).toBe(false);
  });
});
