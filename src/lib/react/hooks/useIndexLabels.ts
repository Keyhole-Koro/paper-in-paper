import { useMemo } from 'react';
import type { PaperId, PaperViewState } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import type { DemandSnapshot } from '../../core/layout';
import { buildPackedLeftIndexLabels } from '../internal/indexLabels';
import type { NodeLayoutEntry } from '../context/LayoutContext';

export function useIndexLabels(
  canvasHeight: number,
  layoutMap: Map<PaperId, NodeLayoutEntry>,
  state: PaperViewState,
  demandSnapshot: DemandSnapshot,
  config: PaperCanvasConfig,
) {
  return useMemo(() => {
    if (canvasHeight === 0 || layoutMap.size === 0) return [];
    return buildPackedLeftIndexLabels(
      layoutMap,
      state.paperMap,
      state.expansionMap,
      state.indexedContentIds,
      demandSnapshot.policyMap,
      config,
      canvasHeight,
    );
  }, [
    canvasHeight,
    layoutMap,
    state.paperMap,
    state.expansionMap,
    state.indexedContentIds,
    demandSnapshot.policyMap,
    config,
  ]);
}
