import type { CSSProperties } from 'react';
import type { PaperId, PaperMap, ExpansionMap } from '../../../../core/types';

const BRANCH_HUES = [210, 155, 35, 280, 10, 180, 320, 60];

export const EMPTY_IDS: PaperId[] = [];

export function getBranchHue(paperMap: PaperMap, paperId: PaperId, rootId: PaperId): number | null {
  const root = paperMap.get(rootId);
  if (!root) return null;

  const directChildIndex = root.childIds.indexOf(paperId);
  if (directChildIndex !== -1) {
    return BRANCH_HUES[directChildIndex % BRANCH_HUES.length];
  }

  let current = paperMap.get(paperId)?.parentId ?? null;
  while (current !== null) {
    const branchIndex = root.childIds.indexOf(current);
    if (branchIndex !== -1) {
      return BRANCH_HUES[branchIndex % BRANCH_HUES.length];
    }
    current = paperMap.get(current)?.parentId ?? null;
  }

  return null;
}

export function getNodeVisualState({
  isRoot,
  hue,
  isPrimary,
  depth,
  openChildIds,
  hasContent,
  isHeaderHovered,
}: {
  isRoot: boolean;
  hue: number | null;
  isPrimary: boolean;
  depth: number;
  openChildIds: PaperId[];
  hasContent: boolean;
  isHeaderHovered: boolean;
}) {
  const background = isRoot
    ? 'transparent'
    : hue !== null
      ? isPrimary
        ? `hsl(${hue}, 55%, ${Math.max(93, 98 - depth * 1.5)}%)`
        : `hsl(${hue}, 35%, ${Math.max(87, 93 - depth * 1.5)}%)`
      : isPrimary
        ? `rgba(255,255,255,${Math.max(0.94, 1 - depth * 0.02)})`
        : `rgba(255,255,255,${Math.max(0.72, 0.82 - depth * 0.04)})`;

  const borderColor = isRoot
    ? 'transparent'
    : hue !== null
      ? `hsl(${hue}, 40%, ${isPrimary ? 78 : 82}%)`
      : isPrimary
        ? 'rgba(0,0,0,0.08)'
        : 'rgba(0,0,0,0.06)';

  const shadow = isRoot
    ? 'none'
    : isPrimary && hue !== null
      ? `0 4px 24px hsla(${hue}, 50%, 40%, ${Math.min(0.3, 0.1 + depth * 0.06)})`
      : isPrimary
        ? `0 4px 24px rgba(0,0,0,${Math.min(0.25, 0.1 + depth * 0.05)})`
        : 'none';

  const contentColor = hue !== null ? `hsl(${hue}, 20%, 32%)` : '#2b2b36';
  const shouldCollapseContent = openChildIds.length > 0;
  const shouldShowContent = isPrimary && hasContent && (!shouldCollapseContent || isHeaderHovered);
  const nodeZIndex = isRoot ? 1 : isPrimary ? 2 : 1;

  return {
    background,
    borderColor,
    shadow,
    contentColor,
    shouldShowContent,
    nodeZIndex,
  };
}

export function getDragSizeStyle(
  dragRect: { width: number; height: number } | null,
): CSSProperties | null {
  if (!dragRect) return null;
  return {
    width: dragRect.width,
    height: dragRect.height,
    flex: '0 0 auto',
  };
}

export function getScaledRect(
  rect: DOMRect,
  scale: { width: number; height: number },
): DOMRect {
  const width = rect.width * scale.width;
  const height = rect.height * scale.height;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  return new DOMRect(left, top, width, height);
}

// Returns the parentId that currently has paperId in its openChildIds.
export function findCurrentParent(paperId: PaperId, expansionMap: ExpansionMap): PaperId | null {
  for (const [parentId, { openChildIds }] of expansionMap.entries()) {
    if (openChildIds.includes(paperId)) return parentId;
  }
  return null;
}
