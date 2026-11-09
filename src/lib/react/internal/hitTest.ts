import type { PaperId } from '../../core/types';

export interface InsertTarget {
  parentId: PaperId;
  /** The open child to insert before; null appends after the last one. */
  insertBeforeId: PaperId | null;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CardSnapshot extends Box {
  childId: PaperId;
}

export interface RoomSnapshot extends Box {
  parentId: PaperId;
  area: number;
  /** The room's open children in layout order. */
  cards: CardSnapshot[];
}

function boxOf(el: Element): Box {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

/**
 * Measures every registered room and its direct child cards in one DOM pass. Rooms in
 * `excluded` (the dragged paper and everything inside it) are skipped: dropping a paper into
 * its own subtree would cut that subtree off the tree.
 */
export function buildRoomSnapshots(
  rooms: ReadonlyMap<PaperId, HTMLElement>,
  excluded: ReadonlySet<PaperId> = new Set(),
): RoomSnapshot[] {
  const snapshots: RoomSnapshot[] = [];
  for (const [parentId, el] of rooms) {
    if (excluded.has(parentId) || !el.isConnected) continue;
    const box = boxOf(el);
    // Cards keep a stable DOM order; `data-child-index` holds their layout order.
    const ordered: Array<{ card: CardSnapshot; order: number }> = [];
    for (const card of Array.from(el.children)) {
      const childId = card.getAttribute('data-child-id');
      if (!childId) continue;
      const index = Number(card.getAttribute('data-child-index') ?? Number.NaN);
      ordered.push({ card: { childId, ...boxOf(card) }, order: Number.isFinite(index) ? index : ordered.length });
    }
    ordered.sort((a, b) => a.order - b.order);
    const cards = ordered.map((entry) => entry.card);
    snapshots.push({
      parentId,
      ...box,
      area: Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top),
      cards,
    });
  }
  return snapshots;
}

function contains(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/**
 * Whether the pointer is in the leading half of a card. Cards wider than tall split left/right,
 * the others top/bottom, which matches how the room packs them.
 */
function inLeadingHalf(card: Box, x: number, y: number): boolean {
  const width = card.right - card.left;
  const height = card.bottom - card.top;
  return width >= height ? x < card.left + width / 2 : y < card.top + height / 2;
}

/**
 * The drop target under the pointer: the innermost room containing it, and the card to insert
 * before. Over a card's leading half the dragged paper goes before that card, over its trailing
 * half before the next one; anywhere else in the room it goes last.
 */
export function findInsertTargetFromSnapshots(
  snapshots: readonly RoomSnapshot[],
  pointer: { x: number; y: number },
  draggedPaperId: PaperId,
): InsertTarget | null {
  let best: RoomSnapshot | null = null;
  for (const snap of snapshots) {
    if (snap.parentId === draggedPaperId) continue;
    if (contains(snap, pointer.x, pointer.y) && (best === null || snap.area < best.area)) best = snap;
  }
  if (!best) return null;

  const cards = best.cards.filter((card) => card.childId !== draggedPaperId);
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i];
    if (!contains(card, pointer.x, pointer.y)) continue;
    if (inLeadingHalf(card, pointer.x, pointer.y)) return { parentId: best.parentId, insertBeforeId: card.childId };
    return { parentId: best.parentId, insertBeforeId: cards[i + 1]?.childId ?? null };
  }
  return { parentId: best.parentId, insertBeforeId: null };
}

export function sameInsertTarget(a: InsertTarget | null, b: InsertTarget | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.parentId === b.parentId && a.insertBeforeId === b.insertBeforeId;
}
