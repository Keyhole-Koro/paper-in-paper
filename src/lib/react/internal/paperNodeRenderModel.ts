import type { Paper, PaperId } from '../../core/types';
import type { NodeRoomLayout } from '../../core/layout';
import { deriveNodeLayoutPolicyFromVisibility } from '../../core/nodeLayoutPolicy';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import type { NodeVisibilityState } from '../../core/nodeVisibility';
import type { InsertTarget } from './hitTest';
import {
  getPaperTone,
  resolvePaperColorContext,
  type PaperColorContext,
  type PaperTone,
} from './paperColors';
import { derivePaperNodeViewModel, type PaperNodeViewModel } from './paperNodeView';
import type { NodeLayoutEntry } from '../context/LayoutContext';
import type { DragSession } from '../context/DragContext';

const FALLBACK_LAYOUT: NodeRoomLayout = {
  contentRect: { id: '__content__', x: 0, y: 0, width: 0, height: 0 },
  childRects: new Map(),
  closedChildIds: [],
  overflowChildCount: 0,
};

export interface PaperNodeRenderModel {
  paper: Paper;
  layout: NodeRoomLayout;
  view: PaperNodeViewModel;
  tone: PaperTone;
  inheritedColor: PaperColorContext | null;
  currentShare?: number;
  isFocusedView: boolean;
  isDragTargetView: boolean;
  insertBeforeRect?: { x: number; y: number; height: number } | null;
  debugBadge?: string | null;
}

export function derivePaperNodeRenderModel({
  nodeId,
  parentId,
  config,
  paper,
  entry,
  parentEntry,
  session,
  insertTarget,
  inheritedColor,
  isFocused,
  nodeVisibility,
  parentVisibility,
  effectiveAttention,
  debug,
}: {
  nodeId: PaperId;
  parentId: PaperId | null;
  config: PaperCanvasConfig;
  paper: Paper;
  entry: NodeLayoutEntry | undefined;
  parentEntry: NodeLayoutEntry | undefined;
  session: DragSession | null;
  insertTarget: InsertTarget | null;
  inheritedColor?: PaperColorContext | null;
  isFocused: boolean;
  nodeVisibility: NodeVisibilityState;
  parentVisibility: NodeVisibilityState | null;
  effectiveAttention: number;
  debug: boolean;
}): PaperNodeRenderModel {
  const layout = entry?.roomLayout ?? FALLBACK_LAYOUT;
  const isRoot = parentId === null;
  const isDragTarget = session !== null && insertTarget?.parentId === nodeId;
  const hasOpenChildren = layout.childRects.size > 0;
  const layoutPolicy = deriveNodeLayoutPolicyFromVisibility(hasOpenChildren, nodeVisibility, config);
  const currentRect = parentEntry?.roomLayout.childRects.get(nodeId);
  const parentHeaderHeight = parentId && parentVisibility === 'indexed' ? 0 : config.paperNode.headerHeight;
  const parentRoomArea = parentEntry
    ? Math.max(0, parentEntry.allocatedRect.width - config.paperNode.borderWidth) *
      Math.max(0, parentEntry.allocatedRect.height - parentHeaderHeight - config.paperNode.borderWidth)
    : 0;
  const currentShare = currentRect && parentRoomArea > 0
    ? (currentRect.width * currentRect.height) / parentRoomArea
    : undefined;

  const view = derivePaperNodeViewModel({
    nodeId,
    entry,
    isFocused,
    isDragTarget,
    layoutPolicy,
    config: config.paperNode,
  });

  const resolvedColor = resolvePaperColorContext(paper.hue, inheritedColor ?? null, paper.saturationScale);
  const isFocusedView = view.interactionMode === 'focused';
  const isDragTargetView = view.interactionMode === 'drag-target';
  const tone = getPaperTone(resolvedColor, { isRoot, isFocused: isFocusedView });
  const insertBeforeRect = isDragTarget && insertTarget?.insertBeforeId && layout.childRects.has(insertTarget.insertBeforeId)
    ? (() => {
        const rect = layout.childRects.get(insertTarget.insertBeforeId);
        return rect ? { x: rect.x, y: rect.y, height: rect.height } : null;
      })()
    : null;
  const debugBadge = debug
    ? `${nodeId} • att ${Math.round(effectiveAttention)} • ${entry?.allocatedRect.width ?? 0}×${entry?.allocatedRect.height ?? 0} • ${view.interactionMode} • ${nodeVisibility}/${layoutPolicy.mode}${paper.pinnedLayout?.minShare !== undefined ? ' • pinned' : ''}`
    : null;

  return {
    paper,
    layout,
    view,
    tone,
    inheritedColor: resolvedColor,
    currentShare,
    isFocusedView,
    isDragTargetView,
    insertBeforeRect,
    debugBadge,
  };
}
