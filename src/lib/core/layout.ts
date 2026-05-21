import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { getAttentionMultiplier, getEffectiveAttention } from './attention';
import { getOpenChildIds, getOpenChildSet } from './expansion';
import { deriveNodeLayoutPolicy, type NodeLayoutPolicy } from './nodeLayoutPolicy';
import type {
  AccessMap,
  AttentionMap,
  AttentionTimestampMap,
  ExpansionMap,
  PaperId,
  PaperMap,
  PaperViewState,
} from './types';

export interface LayoutItem {
  id: string;
  weight: number;
}

export interface LayoutRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomLayoutResult {
  rects: LayoutRect[];
}

export interface NodeRoomLayout {
  contentRect: LayoutRect;
  childRects: Map<PaperId, LayoutRect>;
  closedChildIds: PaperId[];
  overflowChildCount: number;
}

interface RoomDemandContext {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
  attentionMap: PaperViewState['attentionMap'];
  attentionTimestampMap: PaperViewState['attentionTimestampMap'];
  contentHeightMap: PaperViewState['contentHeightMap'];
  indexedContentIds: Set<PaperId>;
  config: PaperCanvasConfig;
  fallbackIntrinsicHeight: number;
  nowMs: number;
}

export interface DemandSnapshot {
  policyMap: Map<PaperId, NodeLayoutPolicy>;
  contentDemandMap: Map<PaperId, number>;
  roomDemandMap: Map<PaperId, number>;
  effectiveAttentionMap: Map<PaperId, number>;
}

export function getIntrinsicContentDemand(
  _nodeId: PaperId,
  _contentHeightMap: PaperViewState['contentHeightMap'],
  fallbackIntrinsicHeight: number,
): number {
  // Demand intentionally does NOT depend on the measured contentHeightMap.
  // Tying demand to scrollHeight created a ResizeObserver ↔ layout feedback
  // loop: a tighter room width produced a taller scrollHeight, which raised
  // demand, which widened the room, which shortened the scrollHeight, ...
  // The visible result was a several-second "settling but not settling"
  // jitter. Layout now uses a stable per-policy fallback; content overflow
  // is handled by the existing overflow:auto on the room itself.
  return fallbackIntrinsicHeight;
}

export function getContentDemand(
  nodeId: PaperId,
  context: RoomDemandContext,
): number {
  const policy = deriveNodeLayoutPolicy(nodeId, context, context.config);
  if (!policy.contentDemandEnabled) return 0;
  const intrinsic = getIntrinsicContentDemand(
    nodeId,
    context.contentHeightMap,
    context.fallbackIntrinsicHeight,
  );
  const attention = getEffectiveAttention(
    {
      attentionMap: context.attentionMap,
      attentionTimestampMap: context.attentionTimestampMap,
    },
    nodeId,
    context.config,
    context.nowMs,
  );
  return intrinsic * getAttentionMultiplier(attention, context.config);
}

function getCachedContentDemand(
  nodeId: PaperId,
  context: RoomDemandContext,
  policyMap: Map<PaperId, NodeLayoutPolicy>,
  contentDemandMap: Map<PaperId, number>,
  effectiveAttentionMap: Map<PaperId, number>,
): number {
  const cached = contentDemandMap.get(nodeId);
  if (cached !== undefined) return cached;
  const policy = getCachedNodeLayoutPolicy(nodeId, context, context.config, policyMap);
  if (!policy.contentDemandEnabled) {
    contentDemandMap.set(nodeId, 0);
    return 0;
  }
  const intrinsic = getIntrinsicContentDemand(
    nodeId,
    context.contentHeightMap,
    context.fallbackIntrinsicHeight,
  );
  let attention = effectiveAttentionMap.get(nodeId);
  if (attention === undefined) {
    attention = getEffectiveAttention(
      {
        attentionMap: context.attentionMap,
        attentionTimestampMap: context.attentionTimestampMap,
      },
      nodeId,
      context.config,
      context.nowMs,
    );
    effectiveAttentionMap.set(nodeId, attention);
  }
  const demand = intrinsic * getAttentionMultiplier(attention, context.config);
  contentDemandMap.set(nodeId, demand);
  return demand;
}

function computeRoomDemand(
  nodeId: PaperId,
  context: RoomDemandContext,
  policyMap: Map<PaperId, NodeLayoutPolicy>,
  contentDemandMap: Map<PaperId, number>,
  roomDemandMap: Map<PaperId, number>,
  effectiveAttentionMap: Map<PaperId, number>,
): number {
  const cached = roomDemandMap.get(nodeId);
  if (cached !== undefined) return cached;

  const self = getCachedContentDemand(nodeId, context, policyMap, contentDemandMap, effectiveAttentionMap);
  const policy = getCachedNodeLayoutPolicy(nodeId, context, context.config, policyMap);
  const openChildIds = policy.childRoomEnabled ? getOpenChildIds(context.expansionMap, nodeId) : [];
  const childSum = openChildIds.reduce((sum, childId) => {
    return sum + computeRoomDemand(childId, context, policyMap, contentDemandMap, roomDemandMap, effectiveAttentionMap);
  }, 0);

  const total = self + childSum;
  roomDemandMap.set(nodeId, total);
  return total;
}

export function buildRoomDemandMap(
  parentId: PaperId,
  context: RoomDemandContext,
): Map<PaperId, number> {
  const { roomDemandMap } = buildDemandSnapshot(parentId, context);
  const resultMap = new Map<PaperId, number>();
  const openChildIds = getOpenChildIds(context.expansionMap, parentId);
  for (const childId of openChildIds) {
    const value = roomDemandMap.get(childId);
    if (value !== undefined) resultMap.set(childId, value);
  }
  return resultMap;
}

export function buildDemandSnapshot(
  rootId: PaperId,
  context: RoomDemandContext,
): DemandSnapshot {
  const policyMap = new Map<PaperId, NodeLayoutPolicy>();
  const contentDemandMap = new Map<PaperId, number>();
  const roomDemandMap = new Map<PaperId, number>();
  const effectiveAttentionMap = new Map<PaperId, number>();

  computeRoomDemand(rootId, context, policyMap, contentDemandMap, roomDemandMap, effectiveAttentionMap);

  return { policyMap, contentDemandMap, roomDemandMap, effectiveAttentionMap };
}

export function createDemandContext(
  context: RoomDemandContext,
): RoomDemandContext {
  return context;
}

export function getCachedNodeLayoutPolicy(
  nodeId: PaperId,
  context: Pick<RoomDemandContext, 'paperMap' | 'expansionMap' | 'indexedContentIds'>,
  config: PaperCanvasConfig,
  policyMap: Map<PaperId, NodeLayoutPolicy>,
): NodeLayoutPolicy {
  const cached = policyMap.get(nodeId);
  if (cached) return cached;
  const policy = deriveNodeLayoutPolicy(nodeId, context, config);
  policyMap.set(nodeId, policy);
  return policy;
}

export function pickChildRoomDemandMap(
  parentId: PaperId,
  expansionMap: ExpansionMap,
  roomDemandMap: Map<PaperId, number>,
): Map<PaperId, number> {
  const openChildIds = getOpenChildIds(expansionMap, parentId);
  const result = new Map<PaperId, number>();
  for (const childId of openChildIds) {
    const value = roomDemandMap.get(childId);
    if (value !== undefined) result.set(childId, value);
  }
  return result;
}

function worstAspectRatio(
  rowItems: LayoutItem[],
  rowWeight: number,
  totalWeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  const rowHeight = (rowWeight / totalWeight) * containerHeight;
  if (rowHeight <= 0) return Infinity;

  let worst = 0;
  for (const item of rowItems) {
    const w = (item.weight / rowWeight) * containerWidth;
    const h = rowHeight;
    const ar = Math.max(w / h, h / w);
    if (ar > worst) worst = ar;
  }
  return worst;
}

export function computeRoomLayout(
  items: LayoutItem[],
  containerWidth: number,
  containerHeight: number,
  _minAR: number,
  _maxAR: number,
): RoomLayoutResult {
  if (items.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { rects: [] };
  }

  const useColumns = containerWidth > containerHeight;
  const w = useColumns ? containerHeight : containerWidth;
  const h = useColumns ? containerWidth : containerHeight;

  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) {
    return { rects: [] };
  }

  const rows: LayoutItem[][] = [];
  let currentRow: LayoutItem[] = [];
  let currentRowWeight = 0;

  for (const item of items) {
    if (currentRow.length === 0) {
      currentRow.push(item);
      currentRowWeight += item.weight;
      continue;
    }

    const prevWorst = worstAspectRatio(currentRow, currentRowWeight, totalWeight, w, h);
    const nextRow = [...currentRow, item];
    const nextWeight = currentRowWeight + item.weight;
    const nextWorst = worstAspectRatio(nextRow, nextWeight, totalWeight, w, h);

    if (nextWorst <= prevWorst) {
      currentRow.push(item);
      currentRowWeight += item.weight;
    } else {
      rows.push(currentRow);
      currentRow = [item];
      currentRowWeight = item.weight;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const rects: LayoutRect[] = [];
  let y = 0;

  for (const row of rows) {
    const rowWeight = row.reduce((s, i) => s + i.weight, 0);
    const rowHeight = (rowWeight / totalWeight) * h;

    let x = 0;
    for (const item of row) {
      const width = (item.weight / rowWeight) * w;
      const height = rowHeight;
      rects.push({ id: item.id, x, y, width, height });
      x += width;
    }
    y += rowHeight;
  }

  if (useColumns) {
    return {
      rects: rects.map((r) => ({ id: r.id, x: r.y, y: r.x, width: r.height, height: r.width })),
    };
  }
  return { rects };
}

const DEFAULT_MIN_AR = 0.25;
const DEFAULT_MAX_AR = 2.0;
const CONTENT_ID = '__content__';
const SHRINK_STEP = 0.84;
const MAX_SHRINK_PASSES = 6;
const ROOM_MIN_WEIGHT = 1;
const AUTO_OPEN_CHILD_MIN_SHARE = 0.18;
const AUTO_OPEN_CHILD_MIN_SHARE_BUDGET = 0.72;

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
): NodeRoomLayout {
  const w = Math.max(0, containerWidth);
  const h = Math.max(0, containerHeight);
  const zeroContent: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: 0, height: 0 };
  const fullContent: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: w, height: h };

  const parent = paperMap.get(nodeId);
  if (!parent) {
    return { contentRect: zeroContent, childRects: new Map(), closedChildIds: [], overflowChildCount: 0 };
  }

  const openChildIds = getOpenChildIds(expansionMap, nodeId);
  const openSet = getOpenChildSet(expansionMap, nodeId);
  const closedChildIds = parent.childIds.filter((id) => !openSet.has(id));
  const nodePolicy = deriveNodeLayoutPolicy(nodeId, { paperMap, expansionMap, indexedContentIds }, config);

  if (w === 0 || h === 0 || openChildIds.length === 0) {
    return {
      contentRect: nodePolicy.hasContent ? fullContent : zeroContent,
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
  const getPolicy = (id: PaperId) => getCachedNodeLayoutPolicy(id, demandContext, config, snapshot.policyMap);
  const indexedLeafChildIds = new Set(
    openChildIds.filter((id) => !getPolicy(id).reservesRoom),
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
      const childPolicy = getPolicy(childId);
      const child = paperMap.get(childId);
      const current = childDemands.get(childId) ?? ROOM_MIN_WEIGHT;
      return childPolicy.reservesRoom && child?.pinnedLayout?.minShare === undefined && current > ROOM_MIN_WEIGHT;
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
