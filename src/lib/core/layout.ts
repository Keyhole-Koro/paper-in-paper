import type { ImportanceMap, PaperId, ExpansionMap } from './types';
import { getOpenChildIds } from './expansion';

// --- Room weight ---

function computeRoomWeight(
  nodeId: PaperId,
  expansionMap: ExpansionMap,
  importanceMap: ImportanceMap,
  resultMap: Map<PaperId, number>,
): number {
  const cached = resultMap.get(nodeId);
  if (cached !== undefined) return cached;

  const self = importanceMap.get(nodeId) ?? 0;
  const openChildIds = getOpenChildIds(expansionMap, nodeId);

  const childSum = openChildIds.reduce((sum, childId) => {
    return sum + computeRoomWeight(childId, expansionMap, importanceMap, resultMap);
  }, 0);

  const total = self + childSum;
  resultMap.set(nodeId, total);
  return total;
}

export function buildRoomWeightMap(
  parentId: PaperId,
  expansionMap: ExpansionMap,
  importanceMap: ImportanceMap,
): Map<PaperId, number> {
  const resultMap = new Map<PaperId, number>();
  const openChildIds = getOpenChildIds(expansionMap, parentId);
  for (const childId of openChildIds) {
    computeRoomWeight(childId, expansionMap, importanceMap, resultMap);
  }
  return resultMap;
}

// --- Room layout ---

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
