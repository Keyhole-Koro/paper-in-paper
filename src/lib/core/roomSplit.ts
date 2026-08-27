import type { LayoutItem, LayoutRect } from './layout';
import type { PaperId } from './types';

/**
 * A room's split: the structure the user can actually grab.
 *
 * The squarified packer already produces exactly this shape — a stack of rows,
 * each holding a run of items — so a room can be frozen into a split without
 * anything moving on screen. From then on the split, not the packer, decides
 * the arrangement, and every divider in it is draggable.
 *
 * `axis` is the direction the rows stack in; items inside a row run across it.
 * A wide room stacks its rows horizontally (they read as columns), a tall room
 * stacks them vertically.
 */
export type SplitAxis = 'horizontal' | 'vertical';

/** The id a room's own content area goes by inside its split. */
export const CONTENT_ITEM_ID = '__content__';

export interface RoomSplitItem {
  id: string;
  /** Fraction of the row along the row's own run direction. Row items sum to 1. */
  weight: number;
}

export interface RoomSplitRow {
  /** Fraction of the room along `axis`. Rows sum to 1. */
  weight: number;
  items: RoomSplitItem[];
}

export interface RoomSplit {
  axis: SplitAxis;
  rows: RoomSplitRow[];
}

export type RoomSplitMap = Map<PaperId, RoomSplit>;

/** A pane never collapses to nothing, so its divider stays grabbable. */
export const MIN_PANE_RATIO = 0.06;

/** Which divider a drag moves. */
export type DividerTarget =
  /** Between rows `index` and `index + 1`. */
  | { kind: 'row'; index: number }
  /** Between items `index` and `index + 1` of row `row`. */
  | { kind: 'item'; row: number; index: number };

export interface RoomDivider {
  target: DividerTarget;
  /** Which way the divider slides. */
  axis: SplitAxis;
  /** Combined pixel extent of the two panes it separates, along `axis`. */
  pairExtentPx: number;
  /** Current fraction of that extent held by the pane before the divider. */
  ratio: number;
}

/** Per item id, the divider each of its edges maps to (absent = room boundary). */
export type RoomDividerMap = Map<string, Partial<Record<'left' | 'right' | 'top' | 'bottom', RoomDivider>>>;

function normalize(weights: number[]): number[] {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return weights.map(() => 1 / Math.max(1, weights.length));
  return weights.map((w) => Math.max(0, w) / total);
}

/**
 * Freeze the packer's output. `rows` and `useColumns` come straight out of the
 * packing pass, so the resulting split places every item exactly where the
 * packer had just put it.
 */
export function buildRoomSplit(rows: LayoutItem[][], useColumns: boolean): RoomSplit {
  const rowWeights = normalize(rows.map((row) => row.reduce((sum, item) => sum + item.weight, 0)));
  return {
    axis: useColumns ? 'horizontal' : 'vertical',
    rows: rows.map((row, i) => ({
      weight: rowWeights[i],
      items: (() => {
        const itemWeights = normalize(row.map((item) => item.weight));
        return row.map((item, j) => ({ id: item.id, weight: itemWeights[j] }));
      })(),
    })),
  };
}

/**
 * Line a stored split back up with the room's current items.
 *
 * Items that went away (a child closed, was indexed to a label, or moved to
 * another paper) are dropped and their space goes to the rest of their row in
 * proportion. Items that appeared are appended as a new row, taking an equal
 * share of the room. Returns null when nothing is left to lay out.
 */
export function reconcileRoomSplit(split: RoomSplit, itemIds: readonly string[]): RoomSplit | null {
  const wanted = new Set(itemIds);
  const seen = new Set<string>();

  const rows: RoomSplitRow[] = [];
  for (const row of split.rows) {
    const items = row.items.filter((item) => {
      if (!wanted.has(item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    if (items.length === 0) continue;
    const weights = normalize(items.map((item) => item.weight));
    rows.push({ weight: row.weight, items: items.map((item, i) => ({ id: item.id, weight: weights[i] })) });
  }

  const added = itemIds.filter((id) => !seen.has(id));
  if (added.length > 0) {
    // A newly opened paper gets a row of its own, sized like an equal share of
    // the room. Appending rather than squeezing into an existing row keeps the
    // panes the user already arranged recognisable.
    const share = 1 / (rows.length + 1);
    rows.push({ weight: share, items: added.map((id) => ({ id, weight: 1 / added.length })) });
  }

  if (rows.length === 0) return null;
  const rowWeights = normalize(rows.map((row) => row.weight));
  return { axis: split.axis, rows: rows.map((row, i) => ({ ...row, weight: rowWeights[i] })) };
}

function replaceWeights<T extends { weight: number }>(
  entries: T[],
  index: number,
  ratio: number,
): T[] {
  const pairTotal = entries[index].weight + entries[index + 1].weight;
  const clamped = Math.min(1 - MIN_PANE_RATIO, Math.max(MIN_PANE_RATIO, ratio));
  return entries.map((entry, i) => {
    if (i === index) return { ...entry, weight: pairTotal * clamped };
    if (i === index + 1) return { ...entry, weight: pairTotal * (1 - clamped) };
    return entry;
  });
}

/**
 * Move one divider. Only the two panes it separates change; every other pane in
 * the room keeps the weight it had, which is what makes a hand-set arrangement
 * hold as the user goes on adjusting other dividers.
 */
export function setDividerRatio(split: RoomSplit, target: DividerTarget, ratio: number): RoomSplit {
  if (target.kind === 'row') {
    if (target.index < 0 || target.index + 1 >= split.rows.length) return split;
    return { ...split, rows: replaceWeights(split.rows, target.index, ratio) };
  }
  const row = split.rows[target.row];
  if (!row || target.index < 0 || target.index + 1 >= row.items.length) return split;
  const rows = split.rows.slice();
  rows[target.row] = { ...row, items: replaceWeights(row.items, target.index, ratio) };
  return { ...split, rows };
}

export interface PlacedRoomSplit {
  rects: LayoutRect[];
  dividers: RoomDividerMap;
}

/** Lay a split out inside a room of `width` x `height`, and describe its dividers. */
export function placeRoomSplit(split: RoomSplit, width: number, height: number): PlacedRoomSplit {
  const rects: LayoutRect[] = [];
  const dividers: RoomDividerMap = new Map();
  const alongX = split.axis === 'horizontal';
  const rowExtent = alongX ? width : height;
  const itemExtent = alongX ? height : width;

  let rowOffset = 0;
  split.rows.forEach((row, rowIndex) => {
    const rowSize = row.weight * rowExtent;
    let itemOffset = 0;

    row.items.forEach((item, itemIndex) => {
      const itemSize = item.weight * itemExtent;
      rects.push(
        alongX
          ? { id: item.id, x: rowOffset, y: itemOffset, width: rowSize, height: itemSize }
          : { id: item.id, x: itemOffset, y: rowOffset, width: itemSize, height: rowSize },
      );

      const edges: Partial<Record<'left' | 'right' | 'top' | 'bottom', RoomDivider>> = {};

      // The boundary between this pane and the next row, on whichever side the
      // rows stack. Both panes touching it get a grip for the same divider.
      const rowBefore: RoomDivider | null = rowIndex > 0
        ? {
            target: { kind: 'row', index: rowIndex - 1 },
            axis: split.axis,
            pairExtentPx: (split.rows[rowIndex - 1].weight + row.weight) * rowExtent,
            ratio: split.rows[rowIndex - 1].weight / (split.rows[rowIndex - 1].weight + row.weight),
          }
        : null;
      const rowAfter: RoomDivider | null = rowIndex + 1 < split.rows.length
        ? {
            target: { kind: 'row', index: rowIndex },
            axis: split.axis,
            pairExtentPx: (row.weight + split.rows[rowIndex + 1].weight) * rowExtent,
            ratio: row.weight / (row.weight + split.rows[rowIndex + 1].weight),
          }
        : null;

      const itemAxis: SplitAxis = alongX ? 'vertical' : 'horizontal';
      const itemBefore: RoomDivider | null = itemIndex > 0
        ? {
            target: { kind: 'item', row: rowIndex, index: itemIndex - 1 },
            axis: itemAxis,
            pairExtentPx: (row.items[itemIndex - 1].weight + item.weight) * itemExtent,
            ratio: row.items[itemIndex - 1].weight / (row.items[itemIndex - 1].weight + item.weight),
          }
        : null;
      const itemAfter: RoomDivider | null = itemIndex + 1 < row.items.length
        ? {
            target: { kind: 'item', row: rowIndex, index: itemIndex },
            axis: itemAxis,
            pairExtentPx: (item.weight + row.items[itemIndex + 1].weight) * itemExtent,
            ratio: item.weight / (item.weight + row.items[itemIndex + 1].weight),
          }
        : null;

      if (alongX) {
        if (rowBefore) edges.left = rowBefore;
        if (rowAfter) edges.right = rowAfter;
        if (itemBefore) edges.top = itemBefore;
        if (itemAfter) edges.bottom = itemAfter;
      } else {
        if (rowBefore) edges.top = rowBefore;
        if (rowAfter) edges.bottom = rowAfter;
        if (itemBefore) edges.left = itemBefore;
        if (itemAfter) edges.right = itemAfter;
      }
      dividers.set(item.id, edges);

      itemOffset += itemSize;
    });

    rowOffset += rowSize;
  });

  return { rects, dividers };
}
