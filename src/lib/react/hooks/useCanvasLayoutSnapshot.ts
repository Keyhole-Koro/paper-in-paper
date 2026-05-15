import { useMemo, useRef } from 'react';
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

function rectEqual(a: LayoutRect, b: LayoutRect): boolean {
  return a.id === b.id && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function childRectsEqual(a: Map<PaperId, LayoutRect>, b: Map<PaperId, LayoutRect>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, ar] of a) {
    const br = b.get(id);
    if (br === undefined || !rectEqual(ar, br)) return false;
  }
  return true;
}

function entryEqual(a: NodeLayoutEntry, b: NodeLayoutEntry): boolean {
  if (!rectEqual(a.allocatedRect, b.allocatedRect)) return false;
  if (a.roomLayout.overflowChildCount !== b.roomLayout.overflowChildCount) return false;
  if (!rectEqual(a.roomLayout.contentRect, b.roomLayout.contentRect)) return false;
  if (a.roomLayout.closedChildIds.length !== b.roomLayout.closedChildIds.length) return false;
  if (!childRectsEqual(a.roomLayout.childRects, b.roomLayout.childRects)) return false;
  return true;
}

export function useCanvasLayoutSnapshot(
  rootId: PaperId,
  canvasSize: { width: number; height: number },
  state: PaperViewState,
  config: PaperCanvasConfig,
): CanvasLayoutSnapshot {
  const prevLayoutMapRef = useRef<Map<PaperId, NodeLayoutEntry>>(new Map());

  return useMemo(() => {
    const emptySnapshot: DemandSnapshot = {
      policyMap: new Map(),
      contentDemandMap: new Map(),
      roomDemandMap: new Map(),
      effectiveAttentionMap: new Map(),
    };
    if (canvasSize.width === 0 || canvasSize.height === 0) {
      prevLayoutMapRef.current = new Map();
      return { layoutMap: prevLayoutMapRef.current, demandSnapshot: emptySnapshot };
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
    const rawLayoutMap = computeRecursiveLayout(
      rootId,
      { id: rootId, x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
      state,
      config,
      nowMs,
      demandSnapshot,
    );

    // Stabilize entry references: reuse the previous NodeLayoutEntry object
    // when the layout values are identical so useSyncExternalStore consumers
    // (useLayoutEntry) skip re-renders for nodes whose layout didn't change.
    const prev = prevLayoutMapRef.current;
    const layoutMap = new Map<PaperId, NodeLayoutEntry>();
    for (const [id, next] of rawLayoutMap) {
      const old = prev.get(id);
      if (old !== undefined && entryEqual(old, next)) {
        layoutMap.set(id, old);
      } else {
        layoutMap.set(id, next);
      }
    }
    prevLayoutMapRef.current = layoutMap;
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
