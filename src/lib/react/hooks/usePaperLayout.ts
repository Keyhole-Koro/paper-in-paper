import { useMemo } from 'react';
import type { PaperId, PaperMap, ExpansionMap, ImportanceMap, AccessMap } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { getOpenChildIds } from '../../core/expansion';
import { buildEffectiveImportanceMap } from '../../core/importance';
import { computeRoomLayout, type LayoutRect } from '../internal/roomLayout';

export interface RoomLayout {
  contentRect: LayoutRect;
  childRects: Map<PaperId, LayoutRect>;
  closedChildIds: PaperId[];
}

const DEFAULT_MIN_AR = 0.25;
const DEFAULT_MAX_AR = 2.0;
const CONTENT_IMPORTANCE = 100;
const CHILD_BASE_WEIGHT = 100;
const CONTENT_ID = '__content__';
const MIN_CHILD_WEIGHT = 18;
const SHRINK_STEP = 0.84;
const MAX_SHRINK_PASSES = 24;

function layoutNeedsShrink(rects: LayoutRect[], minAR: number, maxAR: number) {
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
  minAR = DEFAULT_MIN_AR,
  maxAR = DEFAULT_MAX_AR,
): RoomLayout {
  const w = Math.max(0, containerWidth);
  const h = Math.max(0, containerHeight);
  const fallback: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: w, height: h };
  
  const parent = paperMap.get(nodeId);
  if (!parent) {
    return { contentRect: fallback, childRects: new Map(), closedChildIds: [] };
  }

  const openChildIds = getOpenChildIds(expansionMap, nodeId);
  const openSet = new Set(openChildIds);
  const closedChildIds = parent.childIds.filter((id) => !openSet.has(id));

  if (w === 0 || h === 0 || openChildIds.length === 0) {
    return {
      contentRect: fallback,
      childRects: new Map(),
      closedChildIds,
    };
  }

  const effectiveMap = buildEffectiveImportanceMap(
    nodeId,
    paperMap,
    expansionMap,
    importanceMap,
  );

  const activeChildIds = openChildIds;

  const childPriority = [...activeChildIds].sort((a, b) => {
    const ia = effectiveMap.get(a) ?? CONTENT_IMPORTANCE;
    const ib = effectiveMap.get(b) ?? CONTENT_IMPORTANCE;
    if (ia !== ib) return ia - ib;
    const ta = accessMap.get(a) ?? 0;
    const tb = accessMap.get(b) ?? 0;
    return ta - tb;
  });

  const childWeights = new Map(activeChildIds.map((id) => [
    id,
    (effectiveMap.get(id) ?? CHILD_BASE_WEIGHT),
  ]));

  let rects = computeRoomLayout(
    [
      { id: CONTENT_ID, weight: CONTENT_IMPORTANCE },
      ...activeChildIds.map((id) => ({ id, weight: childWeights.get(id) ?? CHILD_BASE_WEIGHT })),
    ],
    w,
    h,
    minAR,
    maxAR,
  ).rects;

  let pass = 0;
  while (layoutNeedsShrink(rects, minAR, maxAR) && pass < MAX_SHRINK_PASSES) {
    let changed = false;
    for (const childId of childPriority) {
      const current = childWeights.get(childId) ?? CHILD_BASE_WEIGHT;
      if (current <= MIN_CHILD_WEIGHT) continue;
      const next = Math.max(MIN_CHILD_WEIGHT, current * SHRINK_STEP);
      if (next < current) {
        childWeights.set(childId, next);
        changed = true;
      }
    }
    if (!changed) break;
    rects = computeRoomLayout(
      [
        { id: CONTENT_ID, weight: CONTENT_IMPORTANCE },
        ...activeChildIds.map((id) => ({ id, weight: childWeights.get(id) ?? CHILD_BASE_WEIGHT })),
      ],
      w,
      h,
      minAR,
      maxAR,
    ).rects;
    pass += 1;
  }

  const contentRect = rects.find((r) => r.id === CONTENT_ID) ?? fallback;
  const childRects = new Map<PaperId, LayoutRect>(
    rects.filter((r) => r.id !== CONTENT_ID).map((r) => [r.id, r]),
  );

  return { contentRect, childRects, closedChildIds };
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
      minAR, maxAR,
    );
  }, [nodeId, containerWidth, containerHeight, minAR, maxAR, state.expansionMap, state.importanceMap, state.paperMap, state.contentHeightMap, state.accessMap]);
}
