import { useMemo } from 'react';
import type { PaperId, PaperViewState } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import {
  buildDemandSnapshot,
  computeNodeLayout,
  createDemandContext,
  getCachedNodeLayoutPolicy,
  type DemandSnapshot,
  type LayoutRect,
} from '../../core/layout';
import type { NodeLayoutEntry } from '../context/LayoutContext';

function computeRecursiveLayout(
  nodeId: PaperId,
  allocatedRect: LayoutRect,
  state: PaperViewState,
  config: PaperCanvasConfig,
  nowMs: number,
  demandSnapshot: DemandSnapshot,
): Map<PaperId, NodeLayoutEntry> {
  const policy = getCachedNodeLayoutPolicy(nodeId, state, config, demandSnapshot.policyMap);
  const headerHeight = policy.headerHeight;
  const roomW = Math.max(0, allocatedRect.width - config.paperNode.borderWidth);
  const roomH = Math.max(0, allocatedRect.height - headerHeight - config.paperNode.borderWidth);

  const roomLayout = computeNodeLayout(
    nodeId,
    roomW,
    roomH,
    state.paperMap,
    state.expansionMap,
    state.attentionMap,
    state.attentionTimestampMap,
    state.accessMap,
    state.contentHeightMap,
    state.indexedContentIds,
    config,
    undefined,
    undefined,
    nowMs,
    demandSnapshot,
  );

  const result = new Map<PaperId, NodeLayoutEntry>();
  result.set(nodeId, { allocatedRect, roomLayout });

  for (const [childId, childRect] of roomLayout.childRects) {
    const borderLeft = 1;
    const borderTop = childRect.y > 0 ? 1 : 0;
    const childAllocated: LayoutRect = {
      id: childId,
      x: allocatedRect.x + childRect.x,
      y: allocatedRect.y + headerHeight + childRect.y,
      width: Math.max(0, childRect.width - borderLeft),
      height: Math.max(0, childRect.height - borderTop),
    };
    const childLayouts = computeRecursiveLayout(childId, childAllocated, state, config, nowMs, demandSnapshot);
    for (const [id, entry] of childLayouts) {
      result.set(id, entry);
    }
  }

  return result;
}

export interface CanvasLayoutSnapshot {
  layoutMap: Map<PaperId, NodeLayoutEntry>;
  demandSnapshot: DemandSnapshot;
}

export function useCanvasLayoutSnapshot(
  rootId: PaperId,
  canvasSize: { width: number; height: number },
  state: PaperViewState,
  config: PaperCanvasConfig,
): CanvasLayoutSnapshot {
  return useMemo(() => {
    const emptySnapshot: DemandSnapshot = {
      policyMap: new Map(),
      contentDemandMap: new Map(),
      roomDemandMap: new Map(),
      effectiveAttentionMap: new Map(),
    };
    if (canvasSize.width === 0 || canvasSize.height === 0) {
      return { layoutMap: new Map<PaperId, NodeLayoutEntry>(), demandSnapshot: emptySnapshot };
    }

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
    const demandSnapshot = buildDemandSnapshot(rootId, demandContext);
    const layoutMap = computeRecursiveLayout(
      rootId,
      { id: rootId, x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
      state,
      config,
      nowMs,
      demandSnapshot,
    );
    return { layoutMap, demandSnapshot };
  }, [
    rootId,
    canvasSize.width,
    canvasSize.height,
    state.paperMap,
    state.expansionMap,
    state.attentionMap,
    state.attentionTimestampMap,
    state.accessMap,
    state.contentHeightMap,
    state.indexedContentIds,
    config,
  ]);
}
