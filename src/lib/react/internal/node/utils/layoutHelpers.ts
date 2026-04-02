import type { PaperId } from '../../../../core/types';

export type NodeSize = 'sm' | 'md' | 'lg';

export const SIZE_SPANS: Record<NodeSize, { col: number; row: number }> = {
  sm: { col: 2, row: 2 },
  md: { col: 3, row: 2 },
  lg: { col: 4, row: 3 },
};

export type AccessMap = Map<PaperId, number>;  // paperId → last access timestamp

export function computeGridColumns(widthPx: number): number {
  if (widthPx < 400) return 2;
  if (widthPx < 700) return 4;
  return 6;
}

export function computeGridMetrics(widthPx: number, gapPx = 10): {
  columns: number;
  rowHeight: number;
} {
  const columns = computeGridColumns(widthPx);
  const usableWidth = Math.max(0, widthPx - gapPx * (columns - 1));
  const cellWidth = columns > 0 ? usableWidth / columns : usableWidth;
  const rowHeight = Math.max(72, Math.min(120, Math.round(cellWidth * 0.85)));

  return { columns, rowHeight };
}

export function computeRowSpan(
  heightPx: number,
  rowHeightPx: number,
  minRows: number,
  gapPx = 10,
): number {
  if (rowHeightPx <= 0) return minRows;
  return Math.max(minRows, Math.ceil((heightPx + gapPx) / (rowHeightPx + gapPx)));
}

/**
 * Assigns a NodeSize to each open node based on recency of access.
 * Locked sizes (user-set) are preserved and excluded from auto-assignment.
 *
 * Ranking:
 *   position 0 (most recent) → lg
 *   position 1–2             → md
 *   position 3+              → sm
 */
export function computeAutoLayout(
  openIds: PaperId[],
  accessMap: AccessMap,
  lockedSizes: Map<PaperId, NodeSize>,
): Map<PaperId, NodeSize> {
  const result = new Map<PaperId, NodeSize>();

  // Preserve locked sizes
  for (const [id, size] of lockedSizes) {
    if (openIds.includes(id)) {
      result.set(id, size);
    }
  }

  // Sort unlocked nodes by recency (most recent first)
  const unlocked = openIds.filter((id) => !lockedSizes.has(id));
  const sorted = [...unlocked].sort(
    (a, b) => (accessMap.get(b) ?? 0) - (accessMap.get(a) ?? 0),
  );

  sorted.forEach((id, index) => {
    const size: NodeSize = index === 0 ? 'lg' : index <= 2 ? 'md' : 'sm';
    result.set(id, size);
  });

  return result;
}
