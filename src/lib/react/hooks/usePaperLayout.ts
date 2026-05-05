import { useMemo } from 'react';
import type { PaperId, PaperMap, ExpansionMap, AccessMap, AttentionMap, AttentionTimestampMap } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import { usePaperStore } from '../context/PaperStoreContext';
import { getEffectiveAttention } from '../../core/attention';
import { getOpenChildIds } from '../../core/expansion';
import { buildDemandSnapshot, computeRoomLayout, createDemandContext, pickChildRoomDemandMap, type DemandSnapshot, type LayoutRect } from '../../core/layout';

export interface RoomLayout {
  contentRect: LayoutRect;
  childRects: Map<PaperId, LayoutRect>;
  closedChildIds: PaperId[];
  overflowChildCount: number;
}

const DEFAULT_MIN_AR = 0.25;
const DEFAULT_MAX_AR = 2.0;
const CONTENT_ID = '__content__';
const SHRINK_STEP = 0.84;
const MAX_SHRINK_PASSES = 6;
const ROOM_MIN_WEIGHT = 1;
const AUTO_OPEN_CHILD_MIN_SHARE = 0.18;
const AUTO_OPEN_CHILD_MIN_SHARE_BUDGET = 0.72;

function isIndexedLeafNode(
  nodeId: PaperId,
  paperMap: PaperMap,
  indexedContentIds: Set<PaperId>,
) {
  if (!indexedContentIds.has(nodeId)) return false;
  const paper = paperMap.get(nodeId);
  return (paper?.childIds.length ?? 0) === 0;
}

function roomNeedsShrink(rects: LayoutRect[], minAR: number, maxAR: number) {
  return rects.some((rect) => {
    if (rect.id === CONTENT_ID) return false;
    const ar = Math.max(rect.width, 1) > 0 ? rect.height / rect.width : 1;
    return ar < minAR || ar > maxAR;
  });
}

interface ShareInput {
  id: string;
  demand: number;
  minShare: number;
}

function getAutoOpenChildMinShare(openChildCount: number): number {
  if (openChildCount <= 0) return 0;
  return Math.min(
    AUTO_OPEN_CHILD_MIN_SHARE,
    AUTO_OPEN_CHILD_MIN_SHARE_BUDGET / openChildCount,
  );
}

function normalizeShares(items: ShareInput[]): Map<string, number> {
  if (items.length === 0) return new Map();

  const demandTotal = items.reduce((sum, item) => sum + Math.max(0, item.demand), 0);
  const rawShares = new Map<string, number>(
    items.map((item) => [item.id, demandTotal > 0 ? Math.max(0, item.demand) / demandTotal : 1 / items.length]),
  );

  const mandatoryTotal = items.reduce((sum, item) => sum + Math.max(0, item.minShare), 0);
  if (mandatoryTotal >= 1) {
    const result = new Map<string, number>();
    for (const item of items) {
      result.set(item.id, Math.max(0, item.minShare) / mandatoryTotal);
    }
    return result;
  }

  const available = 1 - mandatoryTotal;
  const extraBasis = new Map<string, number>();
  let extraTotal = 0;
  for (const item of items) {
    const raw = rawShares.get(item.id) ?? 0;
    const basis = item.minShare > 0 ? Math.max(0, raw - item.minShare) : raw;
    extraBasis.set(item.id, basis);
    extraTotal += basis;
  }

  if (extraTotal <= 0) {
    for (const item of items) {
      extraBasis.set(item.id, rawShares.get(item.id) ?? 0);
    }
    extraTotal = Array.from(extraBasis.values()).reduce((sum, value) => sum + value, 0);
  }

  const result = new Map<string, number>();
  for (const item of items) {
    const mandatory = Math.max(0, item.minShare);
    const basis = extraBasis.get(item.id) ?? 0;
    const extra = extraTotal > 0 ? available * (basis / extraTotal) : available / items.length;
    result.set(item.id, mandatory + extra);
  }
  return result;
}

export function computeNodeLayout(
  nodeId: PaperId,
  containerWidth: number,
  containerHeight: number,
  paperMap: PaperMap,
  expansionMap: ExpansionMap,
  attentionMap: AttentionMap,
  attentionTimestampMap: AttentionTimestampMap,
  accessMap: AccessMap,
  contentHeightMap: Map<PaperId, number>,
  indexedContentIds: Set<PaperId> = new Set(),
  config: PaperCanvasConfig,
  minAR = DEFAULT_MIN_AR,
  maxAR = DEFAULT_MAX_AR,
  nowMs: number,
  demandSnapshot?: DemandSnapshot,
): RoomLayout {
  const w = Math.max(0, containerWidth);
  const h = Math.max(0, containerHeight);
  const zeroContent: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: 0, height: 0 };
  const fullContent: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: w, height: h };

  const parent = paperMap.get(nodeId);
  if (!parent) {
    return { contentRect: zeroContent, childRects: new Map(), closedChildIds: [], overflowChildCount: 0 };
  }

  const openChildIds = getOpenChildIds(expansionMap, nodeId);
  const openSet = new Set(openChildIds);
  const closedChildIds = parent.childIds.filter((id) => !openSet.has(id));
  const isContentIndexed = indexedContentIds.has(nodeId);

  if (w === 0 || h === 0 || openChildIds.length === 0) {
    return {
      contentRect: isContentIndexed ? zeroContent : fullContent,
      childRects: new Map(),
      closedChildIds,
      overflowChildCount: 0,
    };
  }

  const fallbackIntrinsicHeight = config.paperNode.headerHeight * 3;
  const demandContext = createDemandContext({
    paperMap,
    expansionMap,
    attentionMap,
    attentionTimestampMap,
    contentHeightMap,
    indexedContentIds,
    config,
    fallbackIntrinsicHeight,
    nowMs,
  });

  const snapshot = demandSnapshot ?? buildDemandSnapshot(nodeId, demandContext);
  const contentDemand = snapshot.contentDemandMap.get(nodeId) ?? 0;
  const roomDemandMap = pickChildRoomDemandMap(nodeId, expansionMap, snapshot.roomDemandMap);
  const indexedLeafChildIds = new Set(
    openChildIds.filter((id) => isIndexedLeafNode(id, paperMap, indexedContentIds)),
  );
  const childDemands = new Map(
    openChildIds.map((id) => [
      id,
      indexedLeafChildIds.has(id) ? 0 : Math.max(roomDemandMap.get(id) ?? 0, ROOM_MIN_WEIGHT),
    ]),
  );

  const roomPriority = [...openChildIds].sort((a, b) => {
    const ra = getEffectiveAttention({ attentionMap, attentionTimestampMap }, a, config, nowMs);
    const rb = getEffectiveAttention({ attentionMap, attentionTimestampMap }, b, config, nowMs);
    if (ra !== rb) return ra - rb;
    const ta = accessMap.get(a) ?? 0;
    const tb = accessMap.get(b) ?? 0;
    return ta - tb;
  });
  const autoOpenChildMinShare = getAutoOpenChildMinShare(openChildIds.length);

  function buildRects() {
    const shareItems: ShareInput[] = [
      ...(contentDemand > 0 ? [{ id: CONTENT_ID, demand: Math.max(0, contentDemand), minShare: 0 }] : []),
      ...openChildIds.map((id) => {
        const child = paperMap.get(id);
        const isIndexedLeafChild = indexedLeafChildIds.has(id);
        return {
          id,
          demand: childDemands.get(id) ?? ROOM_MIN_WEIGHT,
          minShare: isIndexedLeafChild
            ? 0
            : Math.max(
                autoOpenChildMinShare,
                Math.max(0, child?.pinnedLayout?.minShare ?? 0),
              ),
        };
      }).filter((item) => item.demand > 0 || item.minShare > 0),
    ];
    const shares = normalizeShares(shareItems);
    return computeRoomLayout(
      shareItems.map((item) => ({
        id: item.id,
        weight: Math.max(shares.get(item.id) ?? 0, 0),
      })),
      w,
      h,
      minAR,
      maxAR,
    ).rects;
  }

  let rects = buildRects();
  let pass = 0;

  while (roomNeedsShrink(rects, minAR, maxAR) && pass < MAX_SHRINK_PASSES) {
    const targetChildId = roomPriority.find((childId) => {
      const child = paperMap.get(childId);
      const current = childDemands.get(childId) ?? ROOM_MIN_WEIGHT;
      return child?.pinnedLayout?.minShare === undefined && current > ROOM_MIN_WEIGHT;
    });
    if (!targetChildId) break;
    const current = childDemands.get(targetChildId) ?? ROOM_MIN_WEIGHT;
    const next = Math.max(ROOM_MIN_WEIGHT, current * SHRINK_STEP);
    if (next >= current) break;
    childDemands.set(targetChildId, next);
    rects = buildRects();
    pass += 1;
  }

  const overflowChildCount = roomNeedsShrink(rects, minAR, maxAR) ? 1 : 0;
  const contentRect = rects.find((r) => r.id === CONTENT_ID) ?? zeroContent;
  const childRects = new Map<PaperId, LayoutRect>(
    rects.filter((r) => r.id !== CONTENT_ID).map((r) => [r.id, r]),
  );
  for (const childId of indexedLeafChildIds) {
    if (!childRects.has(childId)) {
      childRects.set(childId, { id: childId, x: 0, y: 0, width: 0, height: 0 });
    }
  }

  return { contentRect, childRects, closedChildIds, overflowChildCount };
}

export function usePaperLayout(
  nodeId: PaperId,
  containerWidth: number,
  containerHeight: number,
  minAR = DEFAULT_MIN_AR,
  maxAR = DEFAULT_MAX_AR,
): RoomLayout {
  const { state, config } = usePaperStore();

  return useMemo(() => {
    const nowMs = Date.now();
    const demandContext = createDemandContext({
      paperMap: state.paperMap,
      expansionMap: state.expansionMap,
      attentionMap: state.attentionMap,
      attentionTimestampMap: state.attentionTimestampMap,
      contentHeightMap: state.contentHeightMap,
      indexedContentIds: state.indexedContentIds,
      config,
      fallbackIntrinsicHeight: config.paperNode.headerHeight * 3,
      nowMs,
    });
    const snapshot = buildDemandSnapshot(nodeId, demandContext);
    return computeNodeLayout(
      nodeId,
      containerWidth,
      containerHeight,
      state.paperMap,
      state.expansionMap,
      state.attentionMap,
      state.attentionTimestampMap,
      state.accessMap,
      state.contentHeightMap,
      state.indexedContentIds,
      config,
      minAR,
      maxAR,
      nowMs,
      snapshot,
    );
  }, [
    nodeId,
    containerWidth,
    containerHeight,
    minAR,
    maxAR,
    state.expansionMap,
    state.attentionMap,
    state.attentionTimestampMap,
    state.paperMap,
    state.contentHeightMap,
    state.accessMap,
    state.indexedContentIds,
    config,
  ]);
}
