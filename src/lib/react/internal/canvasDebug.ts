import type { PaperStoreSnapshot } from '../store/createPaperStore';

function formatPercent(part: number, whole: number) {
  if (whole <= 0) return '0.0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** Every laid-out paper with its rects, for the debug panel's "copy" button. */
export function buildCanvasDebugText({ layout, config }: PaperStoreSnapshot): string {
  const lines: string[] = [`canvas: ${layout.width}×${layout.height}`, ''];
  for (const [id, entry] of layout.entries) {
    const { allocatedRect: a, roomLayout: r, policy } = entry;
    const roomArea =
      Math.max(0, a.width - config.paperNode.borderWidth) *
      Math.max(0, a.height - policy.headerHeight - config.paperNode.borderWidth);
    const contentArea = r.contentRect.width * r.contentRect.height;
    lines.push(`[${id}] ${policy.mode}`);
    lines.push(`  allocated: ${a.width}×${a.height} @ (${a.x}, ${a.y})`);
    lines.push(`  content:   ${r.contentRect.width}×${r.contentRect.height} @ (${r.contentRect.x}, ${r.contentRect.y}) ${formatPercent(contentArea, roomArea)}`);
    lines.push(`  children open: ${r.childRects.size}, closed: ${r.closedChildIds.length}, cramped: ${r.crampedChildIds.length}`);
    for (const [cid, cr] of r.childRects) {
      lines.push(`    child[${cid}]: ${cr.width}×${cr.height} @ (${cr.x}, ${cr.y}) ${formatPercent(cr.width * cr.height, roomArea)}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** A summary of the focused paper for the debug panel. */
export function buildFocusedDebugText({ state, layout }: PaperStoreSnapshot): string {
  const focusedNodeId = state.focusedNodeId;
  if (!focusedNodeId) return 'no focused paper';
  const entry = layout.entries.get(focusedNodeId);
  const paper = state.paperMap.get(focusedNodeId);
  if (!entry || !paper) return `focused: ${focusedNodeId} (not on screen)`;

  const room = entry.roomLayout;
  return [
    `focused: ${focusedNodeId}`,
    `title: ${paper.title}`,
    `mode: ${entry.policy.mode}`,
    `clock: ${state.clock}`,
    `allocated: ${entry.allocatedRect.width}×${entry.allocatedRect.height} @ (${entry.allocatedRect.x}, ${entry.allocatedRect.y})`,
    `content: ${room.contentRect.width}×${room.contentRect.height}`,
    `attention: ${Math.round(layout.demand.effectiveAttentionMap.get(focusedNodeId) ?? 0)}`,
    `children: ${room.childRects.size} open / ${room.closedChildIds.length} closed / ${room.crampedChildIds.length} cramped`,
    ...Array.from(room.childRects.entries()).map(([childId, rect]) => `child[${childId}]: ${rect.width}×${rect.height} @ (${rect.x}, ${rect.y})`),
  ].join('\n');
}
