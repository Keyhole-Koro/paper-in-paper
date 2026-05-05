import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { getAttentionMultiplier, getEffectiveAttention } from './attention';
import { getOpenChildIds } from './expansion';
import type { PaperId, PaperMap, ExpansionMap, PaperViewState } from './types';

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
  contentDemandMap: Map<PaperId, number>;
  roomDemandMap: Map<PaperId, number>;
  effectiveAttentionMap: Map<PaperId, number>;
}

export function getIntrinsicContentDemand(
  nodeId: PaperId,
  contentHeightMap: PaperViewState['contentHeightMap'],
  fallbackIntrinsicHeight: number,
): number {
  return Math.max(contentHeightMap.get(nodeId) ?? 0, fallbackIntrinsicHeight);
}

export function getContentDemand(
  nodeId: PaperId,
  context: RoomDemandContext,
): number {
  if (context.indexedContentIds.has(nodeId)) return 0;
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
  contentDemandMap: Map<PaperId, number>,
  effectiveAttentionMap: Map<PaperId, number>,
): number {
  const cached = contentDemandMap.get(nodeId);
  if (cached !== undefined) return cached;
  if (context.indexedContentIds.has(nodeId)) {
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
  contentDemandMap: Map<PaperId, number>,
  roomDemandMap: Map<PaperId, number>,
  effectiveAttentionMap: Map<PaperId, number>,
): number {
  const cached = roomDemandMap.get(nodeId);
  if (cached !== undefined) return cached;

  const self = getCachedContentDemand(nodeId, context, contentDemandMap, effectiveAttentionMap);
  const openChildIds = getOpenChildIds(context.expansionMap, nodeId);
  const childSum = openChildIds.reduce((sum, childId) => {
    return sum + computeRoomDemand(childId, context, contentDemandMap, roomDemandMap, effectiveAttentionMap);
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
  const contentDemandMap = new Map<PaperId, number>();
  const roomDemandMap = new Map<PaperId, number>();
  const effectiveAttentionMap = new Map<PaperId, number>();

  computeRoomDemand(rootId, context, contentDemandMap, roomDemandMap, effectiveAttentionMap);

  return { contentDemandMap, roomDemandMap, effectiveAttentionMap };
}

export function createDemandContext(
  context: RoomDemandContext,
): RoomDemandContext {
  return context;
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
