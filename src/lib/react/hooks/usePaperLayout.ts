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
const CONTENT_ID = '__content__';

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

    const items = [
      { id: CONTENT_ID, weight: CONTENT_IMPORTANCE },
      ...openChildIds.map((id) => ({
        id,
        weight: Math.max(1, effectiveMap.get(id) ?? CONTENT_IMPORTANCE),
      })),
    ];

    const { rects } = computeRoomLayout(items, w, h, minAR, maxAR);

    const contentRect = rects.find((r) => r.id === CONTENT_ID) ?? fallback;
    const childRects = new Map<PaperId, LayoutRect>(
      rects.filter((r) => r.id !== CONTENT_ID).map((r) => [r.id, r]),
    );

    return { contentRect, childRects, closedChildIds };
  }, [nodeId, containerWidth, containerHeight, minAR, maxAR, state.expansionMap, state.importanceMap, state.paperMap]);
}
