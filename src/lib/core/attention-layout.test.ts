import { describe, expect, it } from 'vitest';
import { defaultPaperCanvasConfig } from '../config/paperCanvasConfig';
import { getAttentionMultiplier, getEffectiveAttention } from './attention';
import { createInitialState, reduce } from './commands';
import { buildRoomDemandMap, getContentDemand } from './layout';
import { buildPaperMap } from './tree';
import { computeNodeLayout } from '../react/hooks/usePaperLayout';
import { selectLowImportanceCandidates } from './candidates';
import type { Paper } from './types';

function buildState(papers: Paper[]) {
  return createInitialState(buildPaperMap(papers), defaultPaperCanvasConfig);
}

describe('attention and layout', () => {
  it('uses content height to increase content demand', () => {
    const state = buildState([
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a', 'b'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [], attentionScore: 100 },
      { id: 'b', title: 'b', description: '', content: '', parentId: 'root', childIds: [], attentionScore: 100 },
    ]);
    state.contentHeightMap.set('a', 400);
    state.contentHeightMap.set('b', 120);

    const context = {
      paperMap: state.paperMap,
      expansionMap: state.expansionMap,
      attentionMap: state.attentionMap,
      attentionTimestampMap: state.attentionTimestampMap,
      contentHeightMap: state.contentHeightMap,
      indexedContentIds: state.indexedContentIds,
      config: defaultPaperCanvasConfig,
      fallbackIntrinsicHeight: defaultPaperCanvasConfig.paperNode.headerHeight * 3,
      nowMs: 1_000,
    };

    expect(getContentDemand('a', context)).toBeGreaterThan(getContentDemand('b', context));
  });

  it('caps attention multiplier at configured max', () => {
    const multiplier = getAttentionMultiplier(100_000, defaultPaperCanvasConfig);
    expect(multiplier).toBe(defaultPaperCanvasConfig.attention.multiplierMax);
  });

  it('computes room demand from content plus descendants', () => {
    const state = buildState([
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: ['b'], attentionScore: 100 },
      { id: 'b', title: 'b', description: '', content: '', parentId: 'a', childIds: [], attentionScore: 100 },
    ]);
    state.expansionMap.set('root', { openChildIds: ['a'] });
    state.expansionMap.set('a', { openChildIds: ['b'] });
    state.contentHeightMap.set('a', 300);
    state.contentHeightMap.set('b', 200);
    const context = {
      paperMap: state.paperMap,
      expansionMap: state.expansionMap,
      attentionMap: state.attentionMap,
      attentionTimestampMap: state.attentionTimestampMap,
      contentHeightMap: state.contentHeightMap,
      indexedContentIds: state.indexedContentIds,
      config: defaultPaperCanvasConfig,
      fallbackIntrinsicHeight: defaultPaperCanvasConfig.paperNode.headerHeight * 3,
      nowMs: 1_000,
    };

    const ownDemand = getContentDemand('a', context);
    const childDemand = getContentDemand('b', context);
    const roomDemandMap = buildRoomDemandMap('root', context);
    expect(roomDemandMap.get('a')).toBeCloseTo(ownDemand + childDemand, 5);
  });

  it('treats indexed content as zero content demand while keeping child demand', () => {
    const state = buildState([
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: ['b'], attentionScore: 100 },
      { id: 'b', title: 'b', description: '', content: '', parentId: 'a', childIds: [], attentionScore: 100 },
    ]);
    state.expansionMap.set('root', { openChildIds: ['a'] });
    state.expansionMap.set('a', { openChildIds: ['b'] });
    state.indexedContentIds.add('a');
    state.contentHeightMap.set('a', 300);
    state.contentHeightMap.set('b', 200);
    const context = {
      paperMap: state.paperMap,
      expansionMap: state.expansionMap,
      attentionMap: state.attentionMap,
      attentionTimestampMap: state.attentionTimestampMap,
      contentHeightMap: state.contentHeightMap,
      indexedContentIds: state.indexedContentIds,
      config: defaultPaperCanvasConfig,
      fallbackIntrinsicHeight: defaultPaperCanvasConfig.paperNode.headerHeight * 3,
      nowMs: 1_000,
    };

    expect(getContentDemand('a', context)).toBe(0);
    const roomDemandMap = buildRoomDemandMap('root', context);
    expect(roomDemandMap.get('a')).toBeCloseTo(getContentDemand('b', context), 5);
  });

  it('keeps pinned child above its minimum share', () => {
    const state = buildState([
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a', 'b'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [], attentionScore: 10, pinnedLayout: { minShare: 0.4 } },
      { id: 'b', title: 'b', description: '', content: '', parentId: 'root', childIds: [], attentionScore: 200 },
    ]);
    state.expansionMap.set('root', { openChildIds: ['a', 'b'] });
    state.contentHeightMap.set('root', 200);
    state.contentHeightMap.set('a', 50);
    state.contentHeightMap.set('b', 500);

    const layout = computeNodeLayout(
      'root',
      1000,
      1000,
      state.paperMap,
      state.expansionMap,
      state.attentionMap,
      state.attentionTimestampMap,
      state.accessMap,
      state.contentHeightMap,
      state.indexedContentIds,
      defaultPaperCanvasConfig,
      0.25,
      2,
      1_000,
    );

    const rect = layout.childRects.get('a');
    expect(rect).toBeDefined();
    const share = (rect!.width * rect!.height) / (1000 * 1000);
    expect(share).toBeGreaterThanOrEqual(0.39);
  });

  it('excludes pinned nodes from auto-close candidates', () => {
    const state = buildState([
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a', 'b'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [], attentionScore: 1, pinnedLayout: { minShare: 0.2 } },
      { id: 'b', title: 'b', description: '', content: '', parentId: 'root', childIds: [], attentionScore: 2 },
    ]);
    state.expansionMap.set('root', { openChildIds: ['a', 'b'] });
    state.attentionTimestampMap.set('a', 0);
    state.attentionTimestampMap.set('b', 0);

    expect(selectLowImportanceCandidates(state, 'root', 1_000, defaultPaperCanvasConfig)).toEqual(['b']);
  });

  it('clears pinned layout when moving a node', () => {
    let state = buildState([
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a', 'target'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: ['b'] },
      { id: 'target', title: 'target', description: '', content: '', parentId: 'root', childIds: [] },
      { id: 'b', title: 'b', description: '', content: '', parentId: 'a', childIds: [], pinnedLayout: { minShare: 0.3 } },
    ]);
    state.expansionMap.set('root', { openChildIds: ['a', 'target'] });
    state.expansionMap.set('a', { openChildIds: ['b'] });

    state = reduce(state, { type: 'MOVE_NODE', nodeId: 'b', targetParentId: 'root', insertBeforeId: null }, defaultPaperCanvasConfig);
    expect(state.paperMap.get('b')?.pinnedLayout).toBeUndefined();
  });

  it('applies lazy decay before boosting attention', () => {
    let state = buildState([
      { id: 'root', title: 'root', description: '', content: '', parentId: null, childIds: ['a'] },
      { id: 'a', title: 'a', description: '', content: '', parentId: 'root', childIds: [], attentionScore: 100 },
    ]);
    state.attentionMap.set('a', 100);
    state.attentionTimestampMap.set('a', Date.now() - defaultPaperCanvasConfig.attention.decayHalfLifeMs);
    state = reduce(state, { type: 'FOCUS_NODE', nodeId: 'a' }, defaultPaperCanvasConfig);
    const effective = getEffectiveAttention(state, 'a', defaultPaperCanvasConfig, state.attentionTimestampMap.get('a') ?? Date.now());
    expect(effective).toBeCloseTo(50 + defaultPaperCanvasConfig.attention.focusBonus, 0);
  });
});

