import type { PaperId } from '../../core/types';

export interface InsertTarget {
  parentId: PaperId;
  insertBeforeId: PaperId | null;
}

interface RoomEntry {
  el: HTMLElement;
  parentId: PaperId;
}

export function findInsertTarget(
  rooms: Map<PaperId, RoomEntry>,
  pointer: { x: number; y: number },
  draggedPaperId: PaperId,
): InsertTarget | null {
  // find the innermost room whose rect contains the pointer,
  // excluding the dragged node's own room
  let best: RoomEntry | null = null;
  let bestArea = Infinity;

  for (const entry of rooms.values()) {
    if (entry.parentId === draggedPaperId) continue;
    const rect = entry.el.getBoundingClientRect();
    if (
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom
    ) {
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        best = entry;
      }
    }
  }

  if (!best) return null;

  // determine primary scan axis from room aspect ratio
  const roomRect = best.el.getBoundingClientRect();
  const useXAxis = roomRect.width > roomRect.height;

  // collect direct child cards, sort by position along dominant axis
  const cards = Array.from(best.el.querySelectorAll<HTMLElement>(':scope > [data-child-id]'));
  cards.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return useXAxis ? ra.left - rb.left : ra.top - rb.top;
  });

  let insertBeforeId: PaperId | null = null;
  for (const card of cards) {
    const childId = card.getAttribute('data-child-id');
    if (!childId || childId === draggedPaperId) continue;
    const rect = card.getBoundingClientRect();
    const mid = useXAxis
      ? rect.left + rect.width / 2
      : rect.top + rect.height / 2;
    const pos = useXAxis ? pointer.x : pointer.y;
    if (pos < mid) {
      insertBeforeId = childId;
      break;
    }
  }

  return { parentId: best.parentId, insertBeforeId };
}
