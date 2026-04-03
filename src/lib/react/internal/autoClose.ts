import type { PaperId, PaperViewState } from '../../core/types';
import { getOpenChildIds } from '../../core/expansion';

/**
 * 指定 parent の open child のうち、自動縮小すべき候補を返す。
 * - protectedUntilMap に守られているノードは除外
 * - importance が低い順、同率なら access が古い順
 */
export function selectAutoCloseCandidates(
  state: PaperViewState,
  parentId: PaperId,
  nowMs: number,
): PaperId[] {
  const openChildIds = getOpenChildIds(state.expansionMap, parentId);
  if (openChildIds.length === 0) return [];

  return openChildIds
    .filter((id) => {
      const protectedUntil = state.protectedUntilMap.get(id) ?? 0;
      return protectedUntil < nowMs;
    })
    .sort((a, b) => {
      const ia = state.importanceMap.get(a) ?? 0;
      const ib = state.importanceMap.get(b) ?? 0;
      if (ia !== ib) return ia - ib; // importance 低い順
      const ta = state.accessMap.get(a) ?? 0;
      const tb = state.accessMap.get(b) ?? 0;
      return ta - tb; // access 古い順
    });
}
