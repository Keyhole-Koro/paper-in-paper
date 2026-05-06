import type { PaperId, PaperViewState } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import { getEffectiveAttention } from '../../core/attention';
import { deriveNodeVisibilityState } from '../../core/nodeVisibility';
import { getCachedNodeLayoutPolicy, type DemandSnapshot } from '../../core/layout';
import type { NodeLayoutEntry } from '../context/LayoutContext';

function formatPercent(part: number, whole: number) {
  if (whole <= 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function buildCanvasDebugText(
  canvasSize: { width: number; height: number },
  layoutMap: Map<PaperId, NodeLayoutEntry>,
  state: PaperViewState,
  config: PaperCanvasConfig,
  demandSnapshot: DemandSnapshot,
) {
  const lines: string[] = [`canvas: ${canvasSize.width}×${canvasSize.height}`, ''];
  for (const [id, entry] of layoutMap) {
    const { allocatedRect: a, roomLayout: r } = entry;
    const headerHeight = getCachedNodeLayoutPolicy(id, state, config, demandSnapshot.policyMap).headerHeight;
    const roomArea =
      Math.max(0, a.width - config.paperNode.borderWidth) *
      Math.max(0, a.height - headerHeight - config.paperNode.borderWidth);
    const contentArea = r.contentRect.width * r.contentRect.height;
    lines.push(`[${id}]`);
    lines.push(`  allocated: ${a.width}×${a.height} @ (${a.x}, ${a.y})`);
    lines.push(`  content:   ${r.contentRect.width}×${r.contentRect.height} @ (${r.contentRect.x}, ${r.contentRect.y}) ${formatPercent(contentArea, roomArea)}`);
    lines.push(`  children open: ${r.childRects.size}, closed: ${r.closedChildIds.length}`);
    for (const [cid, cr] of r.childRects) {
      const childArea = cr.width * cr.height;
      lines.push(`    child[${cid}]: ${cr.width}×${cr.height} @ (${cr.x}, ${cr.y}) ${formatPercent(childArea, roomArea)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function buildFocusedDebugText(
  focusedNodeId: PaperId | null,
  layoutMap: Map<PaperId, NodeLayoutEntry>,
  state: PaperViewState,
  config: PaperCanvasConfig,
  demandSnapshot: DemandSnapshot,
) {
  if (!focusedNodeId) return 'no focused node';
  const focusedDebugEntry = layoutMap.get(focusedNodeId);
  const focusedPaper = state.paperMap.get(focusedNodeId);
  if (!focusedDebugEntry || !focusedPaper) return 'no focused node';

  const focusedHeaderHeight =
    deriveNodeVisibilityState(focusedPaper.id, state) === 'indexed'
      ? getCachedNodeLayoutPolicy(focusedPaper.id, state, config, demandSnapshot.policyMap).headerHeight
      : config.paperNode.headerHeight;
  const focusedRoomArea =
    Math.max(0, focusedDebugEntry.allocatedRect.width - config.paperNode.borderWidth) *
    Math.max(0, focusedDebugEntry.allocatedRect.height - focusedHeaderHeight - config.paperNode.borderWidth);
  const focusedContentArea =
    focusedDebugEntry.roomLayout.contentRect.width * focusedDebugEntry.roomLayout.contentRect.height;

  return [
    `focused: ${focusedNodeId}`,
    `title: ${focusedPaper.title}`,
    `visibility: ${deriveNodeVisibilityState(focusedPaper.id, state)}`,
    `allocated: ${focusedDebugEntry.allocatedRect.width}×${focusedDebugEntry.allocatedRect.height} @ (${focusedDebugEntry.allocatedRect.x}, ${focusedDebugEntry.allocatedRect.y})`,
    `content: ${focusedDebugEntry.roomLayout.contentRect.width}×${focusedDebugEntry.roomLayout.contentRect.height} @ (${focusedDebugEntry.roomLayout.contentRect.x}, ${focusedDebugEntry.roomLayout.contentRect.y}) ${formatPercent(focusedContentArea, focusedRoomArea)}`,
    `attention: ${Math.round(getEffectiveAttention(state, focusedNodeId, config, Date.now()))}`,
    `children: ${focusedDebugEntry.roomLayout.childRects.size} open / ${focusedDebugEntry.roomLayout.closedChildIds.length} closed`,
    ...Array.from(focusedDebugEntry.roomLayout.childRects.entries()).map(([childId, rect]) => {
      const childArea = rect.width * rect.height;
      return `child[${childId}]: ${rect.width}×${rect.height} @ (${rect.x}, ${rect.y}) ${formatPercent(childArea, focusedRoomArea)}`;
    }),
  ].join('\n');
}
