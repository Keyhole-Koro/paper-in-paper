import type { PaperId, PaperViewState } from './types';
import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { getEffectiveAttention } from './attention';
import { getOpenChildIds } from './expansion';

export function selectLowImportanceCandidates(
  state: PaperViewState,
  parentId: PaperId,
  nowMs: number,
  config: PaperCanvasConfig,
): PaperId[] {
  const openChildIds = getOpenChildIds(state.expansionMap, parentId);
  if (openChildIds.length === 0) return [];

  const eligible = openChildIds
    .filter((id) => {
      const protectedUntil = state.protectedUntilMap.get(id) ?? 0;
      const paper = state.paperMap.get(id);
      return protectedUntil < nowMs && paper?.pinnedLayout?.minShare === undefined;
    })
    .sort((a, b) => {
      const ia = getEffectiveAttention(state, a, config, nowMs);
      const ib = getEffectiveAttention(state, b, config, nowMs);
      if (ia !== ib) return ia - ib;
      const ta = state.accessMap.get(a) ?? 0;
      const tb = state.accessMap.get(b) ?? 0;
      return ta - tb;
    });

  const belowThreshold = eligible.filter((id) => {
    return getEffectiveAttention(state, id, config, nowMs) <= config.attention.autoCloseThreshold;
  });

  return belowThreshold.length > 0 ? belowThreshold : eligible;
}

