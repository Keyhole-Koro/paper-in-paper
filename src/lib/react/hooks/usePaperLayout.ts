import { useMemo } from 'react';
import type { PaperId } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import {
  buildDemandSnapshot,
  computeNodeLayout,
  createDemandContext,
  type DemandSnapshot,
  type LayoutRect,
  type NodeRoomLayout,
} from '../../core/layout';

export type RoomLayout = NodeRoomLayout;

const DEFAULT_MIN_AR = 0.25;
const DEFAULT_MAX_AR = 2.0;

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
