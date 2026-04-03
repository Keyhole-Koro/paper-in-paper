import { useMemo } from 'react';
import type { PaperId } from '../../core/types';
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
const DEFAULT_MAX_AR = 4.0;
const CONTENT_IMPORTANCE = 100;
const CHILD_BASE_WEIGHT = 100;
const CONTENT_ID = '__content__';
const MIN_CHILD_WEIGHT = 18;
const SHRINK_STEP = 0.84;
const MAX_SHRINK_PASSES = 24;

function layoutOverflows(rects: LayoutRect[], containerWidth: number, containerHeight: number) {
  return rects.some((rect) => {
    return rect.x < -0.5
      || rect.y < -0.5
      || rect.x + rect.width > containerWidth + 0.5
      || rect.y + rect.height > containerHeight + 0.5;
  });
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
    const fallback: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: containerWidth || 300, height: containerHeight || 200 };
    const parent = state.paperMap.get(nodeId);
    if (!parent) {
      return { contentRect: fallback, childRects: new Map(), closedChildIds: [] };
    }

    const openChildIds = getOpenChildIds(state.expansionMap, nodeId);
    const openSet = new Set(openChildIds);
    const closedChildIds = parent.childIds.filter((id) => !openSet.has(id));

    const w = containerWidth > 0 ? containerWidth : 600;
    const h = containerHeight > 0 ? containerHeight : 400;

    if (openChildIds.length === 0) {
      return {
        contentRect: { id: CONTENT_ID, x: 0, y: 0, width: w, height: h },
        childRects: new Map(),
        closedChildIds,
      };
    }

    const effectiveMap = buildEffectiveImportanceMap(
      nodeId,
      state.paperMap,
      state.expansionMap,
      state.importanceMap,
    );

    const childPriority = [...openChildIds].sort((a, b) => {
      const ia = effectiveMap.get(a) ?? CONTENT_IMPORTANCE;
      const ib = effectiveMap.get(b) ?? CONTENT_IMPORTANCE;
      if (ia !== ib) return ia - ib;
      const ta = state.accessMap.get(a) ?? 0;
      const tb = state.accessMap.get(b) ?? 0;
      return ta - tb;
    });

    const childWeights = new Map(openChildIds.map((id) => [id, CHILD_BASE_WEIGHT]));
    let rects = computeRoomLayout(
      [
        { id: CONTENT_ID, weight: CONTENT_IMPORTANCE },
        ...openChildIds.map((id) => ({ id, weight: childWeights.get(id) ?? CHILD_BASE_WEIGHT })),
      ],
      w,
      h,
      minAR,
      maxAR,
    ).rects;

    let pass = 0;
    while (layoutOverflows(rects, w, h) && pass < MAX_SHRINK_PASSES) {
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
          ...openChildIds.map((id) => ({ id, weight: childWeights.get(id) ?? CHILD_BASE_WEIGHT })),
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
  }, [nodeId, containerWidth, containerHeight, minAR, maxAR, state.expansionMap, state.importanceMap, state.paperMap]);
}
