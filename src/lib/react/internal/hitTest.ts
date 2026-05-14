import type { PaperId } from '../../core/types';

export interface InsertTarget {
  parentId: PaperId;
  insertBeforeId: PaperId | null;
}

interface RoomEntry {
  el: HTMLElement;
  parentId: PaperId;
}

interface CardSnapshot {
  childId: PaperId;
  primaryStart: number; // left or top (depending on room axis)
  primaryMid: number;   // mid along the dominant axis
}

interface RoomSnapshot {
  parentId: PaperId;
  el: HTMLElement;
  left: number;
  right: number;
  top: number;
  bottom: number;
  area: number;
  useXAxis: boolean;
  cards: CardSnapshot[];
}

/**
 * Snapshot all room rects (and their direct child rects) in one DOM pass.
 * Doing this once per drag-start / scroll / resize avoids per-pointermove
 * getBoundingClientRect storms that cause layout thrash on large trees.
 */
export function buildRoomSnapshots(rooms: Map<PaperId, RoomEntry>): RoomSnapshot[] {
  const snapshots: RoomSnapshot[] = [];
  for (const entry of rooms.values()) {
    const rect = entry.el.getBoundingClientRect();
    const useXAxis = rect.width > rect.height;
    const cardEls = entry.el.querySelectorAll<HTMLElement>(':scope > [data-child-id]');
    const cards: CardSnapshot[] = [];
    for (const card of cardEls) {
      const childId = card.getAttribute('data-child-id');
      if (!childId) continue;
      const cardRect = card.getBoundingClientRect();
      cards.push({
        childId,
        primaryStart: useXAxis ? cardRect.left : cardRect.top,
        primaryMid: useXAxis
          ? cardRect.left + cardRect.width / 2
          : cardRect.top + cardRect.height / 2,
      });
    }
    cards.sort((a, b) => a.primaryStart - b.primaryStart);
    snapshots.push({
      parentId: entry.parentId,
      el: entry.el,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      area: rect.width * rect.height,
      useXAxis,
      cards,
    });
  }
  return snapshots;
}

export function findInsertTargetFromSnapshots(
  snapshots: RoomSnapshot[],
  pointer: { x: number; y: number },
  draggedPaperId: PaperId,
): InsertTarget | null {
  let best: RoomSnapshot | null = null;
  let bestArea = Infinity;

  for (const snap of snapshots) {
    if (snap.parentId === draggedPaperId) continue;
    if (
      pointer.x >= snap.left &&
      pointer.x <= snap.right &&
      pointer.y >= snap.top &&
      pointer.y <= snap.bottom &&
      snap.area < bestArea
    ) {
      bestArea = snap.area;
      best = snap;
    }
  }
  if (!best) return null;

  const pos = best.useXAxis ? pointer.x : pointer.y;
  let insertBeforeId: PaperId | null = null;
  for (const card of best.cards) {
    if (card.childId === draggedPaperId) continue;
    if (pos < card.primaryMid) {
      insertBeforeId = card.childId;
      break;
    }
  }
  return { parentId: best.parentId, insertBeforeId };
}

/**
 * Legacy API kept so non-drag callers (or tests) can still use a one-shot
 * hit-test without first building a snapshot. The drag pipeline should use
 * buildRoomSnapshots + findInsertTargetFromSnapshots for cache reuse.
 */
export function findInsertTarget(
  rooms: Map<PaperId, RoomEntry>,
  pointer: { x: number; y: number },
  draggedPaperId: PaperId,
): InsertTarget | null {
  return findInsertTargetFromSnapshots(buildRoomSnapshots(rooms), pointer, draggedPaperId);
}
