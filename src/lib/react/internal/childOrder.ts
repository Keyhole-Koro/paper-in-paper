import type { LayoutRect } from '../../core/layout';
import type { PaperId } from '../../core/types';

export interface PlacedChild {
  id: PaperId;
  rect: LayoutRect;
  /** Position in the layout (reading) order. */
  index: number;
}

/**
 * The room's children in a stable DOM order — the paper's own child order — each with its place
 * in the layout. Moving an element in the DOM reloads the iframes inside it, so reordering
 * papers only changes their rects and `data-child-index`, never their DOM position.
 */
export function placeChildren(childIds: readonly PaperId[], childRects: ReadonlyMap<PaperId, LayoutRect>): PlacedChild[] {
  const layoutIndex = new Map<PaperId, number>();
  for (const id of childRects.keys()) layoutIndex.set(id, layoutIndex.size);
  const placed: PlacedChild[] = [];
  const seen = new Set<PaperId>();
  for (const id of childIds) {
    const rect = childRects.get(id);
    if (!rect || seen.has(id)) continue;
    seen.add(id);
    placed.push({ id, rect, index: layoutIndex.get(id)! });
  }
  // A visible child missing from childIds (an inconsistent map) still renders, last.
  for (const [id, rect] of childRects) {
    if (!seen.has(id)) placed.push({ id, rect, index: layoutIndex.get(id)! });
  }
  return placed;
}
