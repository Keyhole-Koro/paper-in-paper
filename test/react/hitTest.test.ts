import { describe, expect, it, vi } from 'vitest';
import { buildRoomSnapshots, findInsertTargetFromSnapshots, sameInsertTarget, type RoomSnapshot } from '../../src/lib/react/internal/hitTest';
import { placeChildren } from '../../src/lib/react/internal/childOrder';

const room = (parentId: string, left: number, top: number, right: number, bottom: number, cards: RoomSnapshot['cards'] = []): RoomSnapshot =>
  ({ parentId, left, top, right, bottom, area: (right - left) * (bottom - top), cards });

const card = (childId: string, left: number, top: number, right: number, bottom: number) => ({ childId, left, top, right, bottom });

describe('findInsertTargetFromSnapshots', () => {
  // root (0..1000 × 0..800) holds a wide card a (0..500 × 0..400) and b (500..1000 × 0..400) and
  // a tall card c (0..300 × 400..800); a's own room is inside it.
  const snapshots = [
    room('root', 0, 0, 1000, 800, [card('a', 0, 0, 500, 400), card('b', 500, 0, 1000, 400), card('c', 0, 400, 300, 800)]),
    room('a', 0, 40, 500, 400),
  ];

  it('picks the innermost room under the pointer', () => {
    expect(findInsertTargetFromSnapshots(snapshots, { x: 100, y: 100 }, 'b')).toEqual({ parentId: 'a', insertBeforeId: null });
    expect(findInsertTargetFromSnapshots(snapshots, { x: 700, y: 100 }, 'c')?.parentId).toBe('root');
    expect(findInsertTargetFromSnapshots(snapshots, { x: 2000, y: 100 }, 'c')).toBeNull();
  });

  it('never targets the dragged paper itself', () => {
    expect(findInsertTargetFromSnapshots(snapshots, { x: 100, y: 100 }, 'a')?.parentId).toBe('root');
  });

  it('inserts before a card from its leading half and after it from its trailing half', () => {
    // b is wider than tall: split left/right.
    expect(findInsertTargetFromSnapshots(snapshots, { x: 600, y: 200 }, 'x')).toEqual({ parentId: 'root', insertBeforeId: 'b' });
    expect(findInsertTargetFromSnapshots(snapshots, { x: 900, y: 200 }, 'x')).toEqual({ parentId: 'root', insertBeforeId: 'c' });
    // When the next card is the dragged one itself, the drop appends.
    expect(findInsertTargetFromSnapshots(snapshots, { x: 900, y: 200 }, 'c')).toEqual({ parentId: 'root', insertBeforeId: null });
    // c is taller than wide: split top/bottom; after the last card means append.
    expect(findInsertTargetFromSnapshots(snapshots, { x: 100, y: 450 }, 'b')).toEqual({ parentId: 'root', insertBeforeId: 'c' });
    expect(findInsertTargetFromSnapshots(snapshots, { x: 100, y: 750 }, 'b')).toEqual({ parentId: 'root', insertBeforeId: null });
  });

  it('skips the dragged card when choosing the next one', () => {
    expect(findInsertTargetFromSnapshots(snapshots, { x: 450, y: 30 }, 'b')).toEqual({ parentId: 'root', insertBeforeId: 'c' });
  });

  it('appends when the pointer is in the room but over no card', () => {
    expect(findInsertTargetFromSnapshots(snapshots, { x: 600, y: 600 }, 'a')).toEqual({ parentId: 'root', insertBeforeId: null });
  });
});

describe('sameInsertTarget', () => {
  it('compares by value', () => {
    expect(sameInsertTarget({ parentId: 'a', insertBeforeId: null }, { parentId: 'a', insertBeforeId: null })).toBe(true);
    expect(sameInsertTarget({ parentId: 'a', insertBeforeId: 'x' }, { parentId: 'a', insertBeforeId: null })).toBe(false);
    expect(sameInsertTarget(null, null)).toBe(true);
    expect(sameInsertTarget(null, { parentId: 'a', insertBeforeId: null })).toBe(false);
  });
});

describe('buildRoomSnapshots', () => {
  function roomWith(cards: Array<{ id: string; index?: number; left: number }>) {
    const el = document.createElement('div');
    for (const card of cards) {
      const child = document.createElement('div');
      child.setAttribute('data-child-id', card.id);
      if (card.index !== undefined) child.setAttribute('data-child-index', String(card.index));
      vi.spyOn(child, 'getBoundingClientRect').mockReturnValue(
        { left: card.left, top: 0, right: card.left + 100, bottom: 100, width: 100, height: 100, x: card.left, y: 0, toJSON() {} } as DOMRect,
      );
      el.appendChild(child);
    }
    // A nested card belongs to another room.
    const nested = document.createElement('div');
    nested.innerHTML = '<div data-child-id="deep" data-child-index="0"></div>';
    el.appendChild(nested);
    document.body.appendChild(el);
    return el;
  }

  it('lists a room\'s own cards in layout order, whatever their DOM order', () => {
    const el = roomWith([{ id: 'a', index: 2, left: 200 }, { id: 'b', index: 0, left: 0 }, { id: 'c', index: 1, left: 100 }]);
    const [snapshot] = buildRoomSnapshots(new Map([['root', el]]));
    expect(snapshot.cards.map((card) => card.childId)).toEqual(['b', 'c', 'a']);
    el.remove();
  });

  it('falls back to DOM order without indexes and skips excluded or detached rooms', () => {
    const el = roomWith([{ id: 'a', left: 0 }, { id: 'b', left: 100 }]);
    expect(buildRoomSnapshots(new Map([['root', el]]))[0].cards.map((card) => card.childId)).toEqual(['a', 'b']);
    expect(buildRoomSnapshots(new Map([['root', el]]), new Set(['root']))).toEqual([]);
    el.remove();
    expect(buildRoomSnapshots(new Map([['root', el]]))).toEqual([]);
  });
});

describe('placeChildren', () => {
  const rect = (id: string) => ({ id, x: 0, y: 0, width: 1, height: 1 });

  it('keeps the paper\'s child order and records each child\'s layout position', () => {
    const rects = new Map([['c', rect('c')], ['a', rect('a')]]);
    expect(placeChildren(['a', 'b', 'c'], rects).map(({ id, index }) => [id, index])).toEqual([['a', 1], ['c', 0]]);
  });

  it('still renders a visible child missing from the child list, last, and ignores duplicates', () => {
    const rects = new Map([['x', rect('x')], ['a', rect('a')]]);
    expect(placeChildren(['a', 'a'], rects).map(({ id, index }) => [id, index])).toEqual([['a', 1], ['x', 0]]);
  });
});
