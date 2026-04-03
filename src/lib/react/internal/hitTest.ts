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
  // find the innermost room whose rect contains the pointer
  let best: RoomEntry | null = null;
  let bestArea = Infinity;

  for (const entry of rooms.values()) {
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

  // find insertBeforeId by scanning child cards in the room
  const cards = best.el.querySelectorAll<HTMLElement>('[data-child-id]');
  let insertBeforeId: PaperId | null = null;

  for (const card of cards) {
    const childId = card.getAttribute('data-child-id');
    if (!childId || childId === draggedPaperId) continue;
    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (pointer.y < midY) {
      insertBeforeId = childId;
      break;
    }
  }

  return { parentId: best.parentId, insertBeforeId };
}
