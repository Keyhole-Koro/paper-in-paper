import type { CanvasLayout } from '../../core/layout';
import type { Paper, PaperId, PaperMap } from '../../core/types';
import { resolvePaperColorContext, type PaperColorContext } from './paperColors';

/** An index label: a tab on the canvas's left edge standing in for an indexed paper. */
export interface IndexLabelNode {
  id: PaperId;
  title: string;
  /** Vertical centre on the canvas, in px. */
  centerY: number;
  /** Length of the tab along the edge, in px. */
  extent: number;
  color: PaperColorContext;
}

export const TAB_THICK = 22;
export const TAB_MIN_LEN = 80;
export const TAB_MAX_LEN = 108;
export const TAB_PACKED_MIN_LEN = 48;

/** Tab length for a title: longer titles get longer tabs (full-width characters count double). */
export function getIndexLabelExtent(title: string): number {
  let width = 0;
  for (const char of title.trim()) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1;
  const estimated = TAB_MIN_LEN + Math.max(0, width - 10) * 2;
  return Math.max(TAB_MIN_LEN, Math.min(TAB_MAX_LEN, estimated));
}

/** Font size for a tab's title. Never below 9px, so long titles stay readable (and ellipsize). */
export function getIndexLabelFontSize(title: string): number {
  const length = title.trim().length;
  if (length >= 16) return 9;
  if (length >= 10) return 10;
  return 11;
}

function resolveColorContextForPaper(nodeId: PaperId, paperMap: PaperMap): PaperColorContext {
  const lineage: Paper[] = [];
  const seen = new Set<PaperId>();
  let currentId: PaperId | null = nodeId;
  while (currentId !== null && !seen.has(currentId)) {
    seen.add(currentId);
    const paper = paperMap.get(currentId);
    if (!paper) break;
    lineage.push(paper);
    currentId = paper.parentId;
  }

  let inherited: PaperColorContext | null = null;
  for (let index = lineage.length - 1; index >= 0; index -= 1) {
    inherited = resolvePaperColorContext(lineage[index].hue, inherited, lineage[index].saturationScale);
  }
  return inherited ?? resolvePaperColorContext(undefined, null);
}

/** Tabs for every indexed paper in the layout, packed along the left edge without overlapping. */
export function buildIndexLabels(layout: CanvasLayout, paperMap: PaperMap): IndexLabelNode[] {
  const desired: IndexLabelNode[] = [];
  for (const [id, entry] of layout.entries) {
    if (!entry.policy.showsIndexLabel) continue;
    const paper = paperMap.get(id);
    if (!paper) continue;
    desired.push({
      id,
      title: paper.title,
      centerY: entry.allocatedRect.y + entry.allocatedRect.height / 2,
      extent: getIndexLabelExtent(paper.title),
      color: resolveColorContextForPaper(id, paperMap),
    });
  }
  desired.sort((a, b) => a.centerY - b.centerY);
  if (desired.length === 0) return [];
  return packLabels(desired, layout.height);
}

function packLabels(nodes: IndexLabelNode[], canvasHeight: number): IndexLabelNode[] {
  const packed = fitLabelExtents(nodes, canvasHeight).map((node) => ({ ...node }));

  for (let i = 0; i < packed.length; i += 1) {
    const extent = packed[i].extent;
    const minCenter = extent / 2;
    const maxCenter = Math.max(minCenter, canvasHeight - extent / 2);
    const previous = i === 0 ? minCenter : packed[i - 1].centerY + packed[i - 1].extent / 2 + extent / 2;
    packed[i].centerY = Math.max(previous, Math.max(minCenter, Math.min(maxCenter, packed[i].centerY)));
  }

  const last = packed[packed.length - 1];
  const lastMaxCenter = Math.max(last.extent / 2, canvasHeight - last.extent / 2);
  if (last.centerY > lastMaxCenter) {
    last.centerY = lastMaxCenter;
    for (let i = packed.length - 2; i >= 0; i -= 1) {
      packed[i].centerY = Math.min(
        packed[i].centerY,
        packed[i + 1].centerY - packed[i + 1].extent / 2 - packed[i].extent / 2,
      );
    }
    const firstMinCenter = packed[0].extent / 2;
    if (packed[0].centerY < firstMinCenter) {
      const shift = firstMinCenter - packed[0].centerY;
      for (const node of packed) node.centerY += shift;
    }
  }

  return packed;
}

function fitLabelExtents(nodes: IndexLabelNode[], canvasHeight: number): IndexLabelNode[] {
  const totalDesired = nodes.reduce((sum, node) => sum + node.extent, 0);
  if (totalDesired <= canvasHeight) return nodes;

  const scale = canvasHeight / totalDesired;
  const scaled = nodes.map((node) => ({
    ...node,
    extent: Math.max(TAB_PACKED_MIN_LEN, Math.floor(node.extent * scale)),
  }));
  let totalScaled = scaled.reduce((sum, node) => sum + node.extent, 0);
  if (totalScaled <= canvasHeight) return scaled;

  const byExtent = scaled
    .map((node, index) => ({ index, extent: node.extent }))
    .sort((a, b) => b.extent - a.extent);
  let overflow = totalScaled - canvasHeight;
  for (const { index } of byExtent) {
    if (overflow <= 0) break;
    const reducible = scaled[index].extent - TAB_PACKED_MIN_LEN;
    if (reducible <= 0) continue;
    const delta = Math.min(reducible, overflow);
    scaled[index].extent -= delta;
    overflow -= delta;
  }
  totalScaled = scaled.reduce((sum, node) => sum + node.extent, 0);
  if (totalScaled > canvasHeight) {
    const uniform = Math.max(1, Math.floor(canvasHeight / Math.max(1, scaled.length)));
    return scaled.map((node) => ({ ...node, extent: uniform }));
  }
  return scaled;
}

function sameColor(a: PaperColorContext, b: PaperColorContext): boolean {
  return a.hue === b.hue && a.depth === b.depth && a.saturationScale === b.saturationScale;
}

/** `next`, or `previous` when every label is the same, so subscribers can skip re-rendering. */
export function stabilizeIndexLabels(
  previous: readonly IndexLabelNode[] | undefined,
  next: IndexLabelNode[],
): readonly IndexLabelNode[] {
  if (!previous || previous.length !== next.length) return next;
  for (let i = 0; i < next.length; i += 1) {
    const a = previous[i];
    const b = next[i];
    if (a.id !== b.id || a.title !== b.title || a.centerY !== b.centerY || a.extent !== b.extent || !sameColor(a.color, b.color)) {
      return next;
    }
  }
  return previous;
}
