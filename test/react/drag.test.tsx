import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Paper } from '../../src/lib/core/types';
import { buildPaperMap, checkTreeInvariants } from '../../src/lib/core/tree';
import { expansion } from '../helpers/papers';
import { center, frameBox, installRafQueue, pointerEvent, renderCanvas, roomBox, type CanvasHarness } from '../helpers/render';

afterEach(cleanup);

const paper = (id: string, parentId: string | null, childIds: string[] = []): Paper =>
  ({ id, title: `T-${id}`, description: '', content: <p>{id}</p>, parentId, childIds });

/** root → a (→ a1), b, c; all open. */
function papers() {
  return buildPaperMap([
    paper('root', null, ['a', 'b', 'c']),
    paper('a', 'root', ['a1']),
    paper('a1', 'a'),
    paper('b', 'root'),
    paper('c', 'root'),
  ]);
}
const openState = { expansionMap: expansion({ root: ['a', 'b', 'c'], a: ['a1'] }) };

const headerOf = (id: string) => document.querySelector(`[data-paper-id-frame="${id}"]`)!.firstElementChild as HTMLElement;
const ghost = (title: string) => Array.from(document.body.querySelectorAll('[aria-hidden="true"]')).find((el) => el.textContent === title);

async function startDrag(view: CanvasHarness, id: string, flush: () => void) {
  const from = center(frameBox(view.handle.current!.getSnapshot(), id));
  fireEvent.pointerDown(headerOf(id), { button: 0, clientX: from.clientX, clientY: from.clientY - 1 });
  fireEvent.pointerMove(headerOf(id), { button: 0, clientX: from.clientX + 20, clientY: from.clientY });
  await act(async () => flush());
}

async function moveTo(point: { clientX: number; clientY: number }, flush: () => void) {
  await act(async () => {
    window.dispatchEvent(pointerEvent('pointermove', point));
    flush();
  });
}

async function drop(point: { clientX: number; clientY: number }) {
  await act(async () => window.dispatchEvent(pointerEvent('pointerup', point)));
}

describe('dragging papers', () => {
  it('shows a ghost while dragging and restores text selection afterwards', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState });
    document.body.style.userSelect = 'text';
    await startDrag(view, 'b', flush);
    expect(ghost('T-b')).toBeTruthy();
    expect(document.body.style.userSelect).toBe('none');
    await drop({ clientX: -100, clientY: -100 });
    expect(ghost('T-b')).toBeUndefined();
    expect(document.body.style.userSelect).toBe('text');
  });

  it('cannot drop a paper into its own subtree', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState });
    await startDrag(view, 'a', flush);
    expect(ghost('T-a')).toBeTruthy();
    const insideChild = center(roomBox(view.handle.current!.getSnapshot(), 'a1'));
    await moveTo(insideChild, flush);
    const roomOf = (id: string) => document.querySelector<HTMLElement>(`[data-paper-id-frame="${id}"]`)!.lastElementChild as HTMLElement;
    expect(roomOf('a1').style.outline).toMatch(/transparent/);
    expect(roomOf('a').style.outline).toMatch(/transparent/);
    expect(roomOf('root').style.outline).not.toMatch(/transparent/);
    // The innermost allowed room is root (a and a1 are excluded), so the drop is a reorder in root.
    await drop(insideChild);
    const state = view.handle.current!.getState();
    expect(state.paperMap.get('a')!.parentId).toBe('root');
    expect(state.paperMap.get('a1')!.parentId).toBe('a');
    expect(checkTreeInvariants(state.paperMap)).toEqual([]);
  });

  it('moves a paper into another paper', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState });
    await startDrag(view, 'c', flush);
    const intoB = center(roomBox(view.handle.current!.getSnapshot(), 'b'));
    await moveTo(intoB, flush);
    const bRoom = document.querySelector<HTMLElement>('[data-paper-id-frame="b"]')!.lastElementChild as HTMLElement;
    expect(bRoom.style.outline).toMatch(/dashed/);
    expect(bRoom.style.outline).not.toMatch(/transparent/);
    await drop(intoB);
    const state = view.handle.current!.getState();
    expect(state.paperMap.get('c')!.parentId).toBe('b');
    expect(state.expansionMap.get('b')!.openChildIds).toEqual(['c']);
    expect(state.focusedNodeId).toBe('c');
  });

  it('reorders within a room without changing the paper data', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState });
    const before = view.handle.current!.getState().paperMap;
    await startDrag(view, 'c', flush);
    const snapshot = view.handle.current!.getSnapshot();
    const room = roomBox(snapshot, 'root')!;
    const aRect = snapshot.layout.entries.get('root')!.roomLayout.childRects.get('a')!;
    // The leading edge of a's card: insert before a.
    const point = { clientX: room.x + aRect.x + 3, clientY: room.y + aRect.y + 3 };
    await moveTo(point, flush);
    await drop(point);
    const state = view.handle.current!.getState();
    expect(state.expansionMap.get('root')!.openChildIds).toEqual(['c', 'a', 'b']);
    expect(state.paperMap).toBe(before);
  });

  it('Escape, pointercancel and losing focus cancel a drag without dropping', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState });
    const intoB = center(roomBox(view.handle.current!.getSnapshot(), 'b'));
    for (const cancel of [
      () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
      () => window.dispatchEvent(pointerEvent('pointercancel', intoB)),
      () => window.dispatchEvent(new Event('blur')),
    ]) {
      await startDrag(view, 'c', flush);
      await moveTo(intoB, flush);
      await act(async () => cancel());
      expect(ghost('T-c')).toBeUndefined();
      await drop(intoB);
      expect(view.handle.current!.getState().paperMap.get('c')!.parentId).toBe('root');
    }
  });

  it('does not drag at all when draggable is false', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState, draggable: false });
    await startDrag(view, 'c', flush);
    expect(ghost('T-c')).toBeUndefined();
    expect(headerOf('c').style.cursor).toBe('default');
  });

  it('lets the host veto drops', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({
      paperMap: papers(),
      defaultOpenState: openState,
      canDrop: ({ targetParentId, sourceParentId }) => targetParentId === sourceParentId,
    });
    await startDrag(view, 'c', flush);
    const intoB = center(roomBox(view.handle.current!.getSnapshot(), 'b'));
    await moveTo(intoB, flush);
    await drop(intoB);
    expect(view.handle.current!.getState().paperMap.get('c')!.parentId).toBe('root');
  });

  it('ends a drag when the canvas unmounts', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState });
    document.body.style.userSelect = '';
    await startDrag(view, 'c', flush);
    view.unmount();
    expect(document.body.style.userSelect).toBe('');
  });
});
