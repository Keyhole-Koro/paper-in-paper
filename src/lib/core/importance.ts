import type { ImportanceMap, PaperId, PaperMap } from './types';
import { getOpenChildIds } from './expansion';
import type { ExpansionMap } from './types';

const DECAY_RATE = 0.00001;

/** ノード自身の importance を時間経過で減衰させる（二乗則） */
export function decayImportance(
  importance: number,
  lastAccessMs: number,
  nowMs: number,
): number {
  const t = (nowMs - lastAccessMs) / 1000;
  return Math.max(0, importance * (1 - DECAY_RATE * t * t));
}

/**
 * ノードの実効 importance を返す。
 * 親は子の合計を自身に加算した値を持つ（再帰）。
 * メモ化のため resultMap に結果を書き込む。
 */
export function computeImportance(
  nodeId: PaperId,
  paperMap: PaperMap,
  expansionMap: ExpansionMap,
  importanceMap: ImportanceMap,
  resultMap: Map<PaperId, number>,
): number {
  const cached = resultMap.get(nodeId);
  if (cached !== undefined) return cached;

  const self = importanceMap.get(nodeId) ?? 0;
  const openChildIds = getOpenChildIds(expansionMap, nodeId);

  const childSum = openChildIds.reduce((sum, childId) => {
    return sum + computeImportance(childId, paperMap, expansionMap, importanceMap, resultMap);
  }, 0);

  const total = self + childSum;
  resultMap.set(nodeId, total);
  return total;
}

/** parent の openChildIds について importance map を構築する */
export function buildEffectiveImportanceMap(
  parentId: PaperId,
  paperMap: PaperMap,
  expansionMap: ExpansionMap,
  importanceMap: ImportanceMap,
): Map<PaperId, number> {
  const resultMap = new Map<PaperId, number>();
  const openChildIds = getOpenChildIds(expansionMap, parentId);
  for (const childId of openChildIds) {
    computeImportance(childId, paperMap, expansionMap, importanceMap, resultMap);
  }
  return resultMap;
}
