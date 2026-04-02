import type { PaperId } from '../../../../core/types';

export type NodeSize = 'sm' | 'md' | 'lg';

export interface LayoutOptions {
  maxOpenChildrenPerParent: number;
  openMeasureDelayMs: number;
  gridGapPx: number;
  gridColumns: {
    narrowMaxWidth: number;
    mediumMaxWidth: number;
    narrowColumns: number;
    mediumColumns: number;
    wideColumns: number;
  };
  gridRowHeight: {
    min: number;
    max: number;
    ratio: number;
  };
  singleOpen: {
    minRows: number;
    extraRows: number;
  };
  descendantPressure: {
    maxDepthBoost: number;
    maxColBoost: number;
  };
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type LayoutOptionsInput = DeepPartial<LayoutOptions>;

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  maxOpenChildrenPerParent: 3,
  openMeasureDelayMs: 180,
  gridGapPx: 10,
  gridColumns: {
    narrowMaxWidth: 400,
    mediumMaxWidth: 700,
    narrowColumns: 2,
    mediumColumns: 4,
    wideColumns: 6,
  },
  gridRowHeight: {
    min: 72,
    max: 120,
    ratio: 0.85,
  },
  singleOpen: {
    minRows: 4,
    extraRows: 1,
  },
  descendantPressure: {
    maxDepthBoost: 3,
    maxColBoost: 2,
  },
};

export const SIZE_SPANS: Record<NodeSize, { col: number; row: number }> = {
  sm: { col: 2, row: 2 },
  md: { col: 3, row: 2 },
  lg: { col: 4, row: 3 },
};

export type AccessMap = Map<PaperId, number>;  // paperId → last access timestamp

export function computeGridColumns(widthPx: number, options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS): number {
  if (widthPx < options.gridColumns.narrowMaxWidth) return options.gridColumns.narrowColumns;
  if (widthPx < options.gridColumns.mediumMaxWidth) return options.gridColumns.mediumColumns;
  return options.gridColumns.wideColumns;
}

export function computeGridMetrics(
  widthPx: number,
  gapPx = DEFAULT_LAYOUT_OPTIONS.gridGapPx,
  options: LayoutOptions = DEFAULT_LAYOUT_OPTIONS,
): {
  columns: number;
  rowHeight: number;
} {
  const columns = computeGridColumns(widthPx, options);
  const usableWidth = Math.max(0, widthPx - gapPx * (columns - 1));
  const cellWidth = columns > 0 ? usableWidth / columns : usableWidth;
  const rowHeight = Math.max(
    options.gridRowHeight.min,
    Math.min(options.gridRowHeight.max, Math.round(cellWidth * options.gridRowHeight.ratio)),
  );

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

export function computeOpenNodeSpan(params: {
  base: { col: number; row: number };
  gridColumns: number;
  openSiblingCount: number;
  descendantOpenCount: number;
  options?: LayoutOptions;
}): { col: number; row: number } {
  const { base, gridColumns, openSiblingCount, descendantOpenCount, options = DEFAULT_LAYOUT_OPTIONS } = params;
  const pressure = Math.min(options.descendantPressure.maxDepthBoost, descendantOpenCount);

  if (openSiblingCount <= 1) {
    return {
      col: Math.max(1, gridColumns),
      row: Math.max(base.row + pressure + options.singleOpen.extraRows, options.singleOpen.minRows),
    };
  }

  return {
    col: Math.min(gridColumns, base.col + Math.min(options.descendantPressure.maxColBoost, pressure)),
    row: base.row + pressure,
  };
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
