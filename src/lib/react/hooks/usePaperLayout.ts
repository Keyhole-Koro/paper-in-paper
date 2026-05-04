import { useMemo } from 'react';
import type { PaperId, PaperMap, ExpansionMap, ImportanceMap, AccessMap } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { getOpenChildIds } from '../../core/expansion';
import { buildRoomWeightMap, computeRoomLayout, type LayoutRect } from '../../core/layout';

export interface RoomLayout {
  contentRect: LayoutRect;
  childRects: Map<PaperId, LayoutRect>;
  closedChildIds: PaperId[];
  overflowChildCount: number;
}

const DEFAULT_MIN_AR = 0.25;
const DEFAULT_MAX_AR = 2.0;
// importanceMap に値がない場合の contentWeight フォールバック
const CONTENT_WEIGHT_FALLBACK = 100;
const CONTENT_ID = '__content__';
const SHRINK_STEP = 0.84;
const MAX_SHRINK_PASSES = 24;
const ROOM_MIN_WEIGHT = 18;

function roomNeedsShrink(rects: LayoutRect[], minAR: number, maxAR: number) {
  return rects.some((rect) => {
    if (rect.id === CONTENT_ID) return false;
    const ar = Math.max(rect.width, 1) > 0 ? rect.height / rect.width : 1;
    return ar < minAR || ar > maxAR;
  });
}

export function computeNodeLayout(
  nodeId: PaperId,
  containerWidth: number,
  containerHeight: number,
  paperMap: PaperMap,
  expansionMap: ExpansionMap,
  importanceMap: ImportanceMap,
  accessMap: AccessMap,
  _contentHeightMap: Map<PaperId, number>,
  indexedNodeIds: Set<PaperId> = new Set(),
  minAR = DEFAULT_MIN_AR,
  maxAR = DEFAULT_MAX_AR,
): RoomLayout {
  const w = Math.max(0, containerWidth);
  const h = Math.max(0, containerHeight);
  const zeroContent: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: 0, height: 0 };
  const fullContent: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: w, height: h };

  const parent = paperMap.get(nodeId);
  if (!parent) {
    return { contentRect: zeroContent, childRects: new Map(), closedChildIds: [], overflowChildCount: 0 };
  }

  const allOpenChildIds = getOpenChildIds(expansionMap, nodeId);
  const openChildIds = allOpenChildIds.filter((id) => !indexedNodeIds.has(id));
  const openSet = new Set(allOpenChildIds);
  const closedChildIds = parent.childIds.filter((id) => !openSet.has(id));

  if (w === 0 || h === 0 || openChildIds.length === 0) {
    return { contentRect: fullContent, childRects: new Map(), closedChildIds, overflowChildCount: 0 };
  }

  // content の weight = このノード自身の rawImportance
  // importance が decay するほど content が縮み、子により多くの room を譲る
  const contentWeight = importanceMap.get(nodeId) ?? CONTENT_WEIGHT_FALLBACK;

  // sibling 間の room 配分 = rawImportance + Σ 子孫の roomWeight（subtree 全量加算）
  const roomWeightMap = buildRoomWeightMap(nodeId, expansionMap, importanceMap);

  const roomPriority = [...openChildIds].sort((a, b) => {
    const ra = roomWeightMap.get(a) ?? 0;
    const rb = roomWeightMap.get(b) ?? 0;
    if (ra !== rb) return ra - rb;
    const ta = accessMap.get(a) ?? 0;
    const tb = accessMap.get(b) ?? 0;
    return ta - tb;
  });

  const roomWeights = new Map(openChildIds.map((id) => [
    id,
    Math.max(roomWeightMap.get(id) ?? 0, 1),
  ]));

  let rects = computeRoomLayout(
    [
      { id: CONTENT_ID, weight: contentWeight },
      ...openChildIds.map((id) => ({ id, weight: roomWeights.get(id) ?? 1 })),
    ],
    w, h, minAR, maxAR,
  ).rects;

  let pass = 0;
  if (roomNeedsShrink(rects, minAR, maxAR)) {
    console.log(`[usePaperLayout] shrinking room for ${nodeId} (w:${w}, h:${h})`);
  }
  while (roomNeedsShrink(rects, minAR, maxAR) && pass < MAX_SHRINK_PASSES) {
    let changed = false;
    for (const childId of roomPriority) {
      const current = roomWeights.get(childId) ?? 1;
      if (current <= ROOM_MIN_WEIGHT) continue;
      const next = Math.max(ROOM_MIN_WEIGHT, current * SHRINK_STEP);
      if (next < current) {
        roomWeights.set(childId, next);
        changed = true;
      }
    }
    if (!changed) break;
    rects = computeRoomLayout(
      [
        { id: CONTENT_ID, weight: contentWeight },
        ...openChildIds.map((id) => ({ id, weight: roomWeights.get(id) ?? 1 })),
      ],
      w, h, minAR, maxAR,
    ).rects;
    pass += 1;
  }

  const overflowChildCount = roomNeedsShrink(rects, minAR, maxAR) ? 1 : 0;

  const contentRect = rects.find((r) => r.id === CONTENT_ID) ?? zeroContent;
  const childRects = new Map<PaperId, LayoutRect>(
    rects.filter((r) => r.id !== CONTENT_ID).map((r) => [r.id, r]),
  );

  return { contentRect, childRects, closedChildIds, overflowChildCount };
}

export function usePaperLayout(
  nodeId: PaperId,
  containerWidth: number,
  containerHeight: number,
  minAR = DEFAULT_MIN_AR,
  maxAR = DEFAULT_MAX_AR,
): RoomLayout {
  const { state } = usePaperStore();

  return useMemo(() => {
    return computeNodeLayout(
      nodeId, containerWidth, containerHeight,
      state.paperMap, state.expansionMap, state.importanceMap, state.accessMap, state.contentHeightMap,
      state.indexedNodeIds, minAR, maxAR,
    );
  }, [nodeId, containerWidth, containerHeight, minAR, maxAR, state.expansionMap, state.importanceMap, state.paperMap, state.contentHeightMap, state.accessMap, state.indexedNodeIds]);
}
