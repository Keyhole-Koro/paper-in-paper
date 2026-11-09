/**
 * Performance regression tests: how many papers re-render for one local change. Before 0.4 any
 * store change re-rendered every paper (and a drag re-rendered every paper on every pointer
 * frame); these pin down that only the papers concerned render now.
 */
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paper } from '../../src/lib/core/types';
import { buildPaperMap } from '../../src/lib/core/tree';
import { expansion } from '../helpers/papers';
import { center, frameBox, installRafQueue, pointerEvent, renderCanvas, roomBox } from '../helpers/render';

const counts = vi.hoisted(() => ({ paper: new Map<string, number>(), frameOrHeader: 0 }));

vi.mock('../../src/lib/react/store/storeContext', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/react/store/storeContext')>();
  return {
    ...mod,
    // PaperNode calls this exactly once per render, and nothing else calls it.
    useLayoutEntry: (nodeId: string) => {
      counts.paper.set(nodeId, (counts.paper.get(nodeId) ?? 0) + 1);
      return mod.useLayoutEntry(nodeId);
    },
  };
});
vi.mock('../../src/lib/react/drag/dragContext', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/lib/react/drag/dragContext')>();
  return {
    ...mod,
    // Called once per render by each paper frame and each header.
    useDragStore: () => {
      counts.frameOrHeader += 1;
      return mod.useDragStore();
    },
  };
});

function reset() {
  counts.paper.clear();
  counts.frameOrHeader = 0;
}
const paperRenders = () => Array.from(counts.paper.values()).reduce((a, b) => a + b, 0);

const CHILDREN = ['c0', 'c1', 'c2'];
const GRANDCHILDREN = ['g0', 'g1', 'g2'];

function papers(): Map<string, Paper> {
  return buildPaperMap([
    { id: 'root', title: 'root', description: '', content: <p>root</p>, parentId: null, childIds: CHILDREN },
    ...CHILDREN.map((id, i) => ({ id, title: id, description: '', content: <p>{id}</p>, parentId: 'root', childIds: [GRANDCHILDREN[i]] })),
    ...GRANDCHILDREN.map((id, i) => ({ id, title: id, description: '', content: <p>{id}</p>, parentId: CHILDREN[i], childIds: [] })),
  ]);
}

const openState = {
  expansionMap: expansion({ root: CHILDREN, c0: ['g0'], c1: ['g1'], c2: ['g2'] }),
  focusedNodeId: 'root',
};

beforeEach(reset);
afterEach(cleanup);

describe('render fan-out', () => {
  it('a host update to one paper re-renders that paper only', async () => {
    const map = papers();
    const view = await renderCanvas({ paperMap: map, defaultOpenState: openState });
    expect(counts.paper.size).toBe(7);
    reset();
    const next = new Map(map);
    next.set('g2', { ...map.get('g2')!, title: 'g2 renamed' });
    await view.rerenderCanvas({ paperMap: next });
    expect(Object.fromEntries(counts.paper)).toEqual({ g2: 1 });
  });

  it('commands that change nothing, and equal maps, re-render nothing', async () => {
    const map = papers();
    const view = await renderCanvas({ paperMap: map, defaultOpenState: openState });
    reset();
    await act(async () => view.handle.current!.dispatch({ type: 'OPEN_NODE', parentId: 'g0', childId: 'root' }));
    await act(async () => view.handle.current!.dispatch({ type: 'FOCUS_NODE', nodeId: 'nope' }));
    await view.rerenderCanvas({ paperMap: new Map(map) });
    expect(paperRenders()).toBe(0);
    expect(counts.frameOrHeader).toBe(0);
  });

  it('a host re-render with equal inline config and labels re-renders no paper', async () => {
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState, config: { layout: { minPaperWidth: 100 } }, labels: { closePaper: 'x' } });
    reset();
    await view.rerenderCanvas({ config: { layout: { minPaperWidth: 100 } }, labels: { closePaper: 'x' } });
    expect(paperRenders()).toBe(0);
  });

  it('pointer moves during a drag re-render no paper; a new drop target re-renders only its frame', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: openState });
    const snapshot = () => view.handle.current!.getSnapshot();
    const header = document.querySelector('[data-paper-id-frame="g0"]')!.firstElementChild as HTMLElement;
    const start = center(frameBox(snapshot(), 'g0'));
    fireEvent.pointerDown(header, { button: 0, ...start });
    fireEvent.pointerMove(header, { button: 0, clientX: start.clientX + 20, clientY: start.clientY });
    await act(async () => flush());
    reset();

    // Ten frames over c2's own content, where the drop target (c2, append) does not change.
    const room = roomBox(snapshot(), 'c2')!;
    const content = snapshot().layout.entries.get('c2')!.roomLayout.contentRect;
    const over = { clientX: room.x + content.x + 10, clientY: room.y + content.y + content.height / 2 };
    await act(async () => {
      window.dispatchEvent(pointerEvent('pointermove', over));
      flush();
    });
    const afterFirst = counts.frameOrHeader;
    for (let i = 1; i <= 10; i += 1) {
      await act(async () => {
        window.dispatchEvent(pointerEvent('pointermove', { clientX: over.clientX + i, clientY: over.clientY + i }));
        flush();
      });
    }
    expect(view.container.ownerDocument.body.textContent).toContain('g0');
    expect(paperRenders()).toBe(0);
    expect(counts.frameOrHeader).toBe(afterFirst);
    // Entering the target re-rendered at most the old and new target frames (and their headers).
    expect(afterFirst).toBeLessThanOrEqual(4);

    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  });
});
