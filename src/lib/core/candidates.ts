import type { PaperId, PaperViewState } from './types';
import { getOpenChildIds } from './expansion';

export function selectLowImportanceCandidates(
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
      if (ia !== ib) return ia - ib;
      const ta = state.accessMap.get(a) ?? 0;
      const tb = state.accessMap.get(b) ?? 0;
      return ta - tb;
    });
}
