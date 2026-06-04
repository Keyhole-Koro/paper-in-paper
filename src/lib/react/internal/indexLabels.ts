import type { ExpansionMap, Paper, PaperId } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import type { NodeLayoutPolicy } from '../../core/nodeLayoutPolicy';
import { deriveNodeLayoutPolicy } from '../../core/nodeLayoutPolicy';
import type { IndexLabelNode } from '../components/IndexLabel';
import { getIndexLabelExtent, TAB_PACKED_MIN_LEN } from '../components/IndexLabel';
import type { NodeLayoutEntry } from '../context/LayoutContext';
import { getPaperTone, resolvePaperColorContext } from './paperColors';

type LeftLabelNode = {
  id: PaperId;
  title: string;
  side: 'left';
  centerX: number;
  centerY: number;
  extent: number;
  background: string;
  borderColor: string;
  textColor: string;
};

export function buildPackedLeftIndexLabels(
  layoutMap: Map<PaperId, NodeLayoutEntry>,
  paperMap: Map<PaperId, Paper>,
  expansionMap: ExpansionMap,
  indexedContentIds: Set<PaperId>,
  policyMap: Map<PaperId, NodeLayoutPolicy>,
  config: PaperCanvasConfig,
  canvasHeight: number,
): IndexLabelNode[] {
  const desired = Array.from(layoutMap.entries())
    .filter(([id]) => {
      const policy = policyMap.get(id) ?? deriveNodeLayoutPolicy(id, { paperMap, expansionMap, indexedContentIds }, config);
      return policy.showsIndexLabel;
    })
    .map(([id, entry]) => {
      const paper = paperMap.get(id);
      if (!paper) return null;
      const tone = getPaperTone(resolveColorContextForPaper(id, paperMap), { isFocused: false });
      return {
        id,
        title: paper.title,
        side: 'left' as const,
        centerX: 0,
        centerY: entry.allocatedRect.y + entry.allocatedRect.height / 2,
        extent: getIndexLabelExtent(paper.title, 'left'),
        background: tone.headerBackground,
        borderColor: tone.border,
        textColor: tone.title,
      };
    })
    .filter((node): node is LeftLabelNode => node !== null)
    .sort((a, b) => a.centerY - b.centerY);

  if (desired.length === 0) return [];

  const packed = fitLabelExtents(desired, canvasHeight).map((node) => ({ ...node }));

  for (let i = 0; i < packed.length; i += 1) {
    const currentExtent = packed[i].extent;
    const currentMinCenter = currentExtent / 2;
    const currentMaxCenter = Math.max(currentMinCenter, canvasHeight - currentExtent / 2);
    const prev =
      i === 0
        ? currentMinCenter
        : packed[i - 1].centerY + packed[i - 1].extent / 2 + currentExtent / 2;
    packed[i].centerY = Math.max(
      prev,
      Math.max(currentMinCenter, Math.min(currentMaxCenter, packed[i].centerY)),
    );
  }

  const lastExtent = packed[packed.length - 1].extent;
  const lastMaxCenter = Math.max(lastExtent / 2, canvasHeight - lastExtent / 2);
  if (packed[packed.length - 1].centerY > lastMaxCenter) {
    packed[packed.length - 1].centerY = lastMaxCenter;
    for (let i = packed.length - 2; i >= 0; i -= 1) {
      const currentExtent = packed[i].extent;
      const nextExtent = packed[i + 1].extent;
      packed[i].centerY = Math.min(
        packed[i].centerY,
        packed[i + 1].centerY - nextExtent / 2 - currentExtent / 2,
      );
    }
    const firstExtent = packed[0].extent;
    const firstMinCenter = firstExtent / 2;
    if (packed[0].centerY < firstMinCenter) {
      const shift = firstMinCenter - packed[0].centerY;
      for (const node of packed) {
        node.centerY += shift;
      }
    }
  }

  return packed;
}

function fitLabelExtents(nodes: LeftLabelNode[], canvasHeight: number) {
  const totalDesired = nodes.reduce((sum, node) => sum + node.extent, 0);
  if (totalDesired <= canvasHeight) return nodes;

  const scale = canvasHeight / totalDesired;
  const scaled = nodes.map((node) => ({
    ...node,
    extent: Math.max(TAB_PACKED_MIN_LEN, Math.floor(node.extent * scale)),
  }));
  let totalScaled = scaled.reduce((sum, node) => sum + node.extent, 0);
  if (totalScaled <= canvasHeight) return scaled;

  const flexibleIndexes = scaled
    .map((node, index) => ({ index, extent: node.extent }))
    .sort((a, b) => b.extent - a.extent);
  let overflow = totalScaled - canvasHeight;
  for (const { index } of flexibleIndexes) {
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

function resolveColorContextForPaper(
  nodeId: PaperId,
  paperMap: Map<PaperId, Paper>,
) {
  const lineage: Paper[] = [];
  let currentId: PaperId | null = nodeId;
  while (currentId) {
    const paper = paperMap.get(currentId);
    if (!paper) break;
    lineage.push(paper);
    currentId = paper.parentId;
  }

  let inherited = null;
  for (let index = lineage.length - 1; index >= 0; index -= 1) {
    inherited = resolvePaperColorContext(lineage[index].hue, inherited, lineage[index].saturationScale);
  }
  return inherited ?? resolvePaperColorContext(undefined, null);
}
