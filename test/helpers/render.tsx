import { act, render, type RenderResult } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { vi } from 'vitest';
import { PaperCanvas, type PaperCanvasHandle, type PaperCanvasProps } from '../../src/lib/react/PaperCanvas';
import type { PaperId } from '../../src/lib/core/types';
import type { PaperStoreSnapshot } from '../../src/lib/react/store/createPaperStore';

export interface CanvasHarness extends RenderResult {
  handle: RefObject<PaperCanvasHandle | null>;
  rerenderCanvas: (props: Partial<PaperCanvasProps>) => Promise<void>;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function domRect({ x, y, width, height }: Box): DOMRect {
  return {
    x, y, width, height,
    left: x, top: y, right: x + width, bottom: y + height,
    toJSON() { return this; },
  } as DOMRect;
}

/** Where a paper's frame sits on the page, following the same nesting the DOM uses. */
export function frameBox(snapshot: PaperStoreSnapshot, id: PaperId): Box | null {
  const entry = snapshot.layout.entries.get(id);
  if (!entry) return null;
  if (id === snapshot.rootId) return { x: 0, y: 0, width: entry.allocatedRect.width, height: entry.allocatedRect.height };
  const parentId = snapshot.state.paperMap.get(id)?.parentId;
  if (!parentId) return null;
  const parentRoom = roomBox(snapshot, parentId);
  const rect = snapshot.layout.entries.get(parentId)?.roomLayout.childRects.get(id);
  if (!parentRoom || !rect) return null;
  const top = rect.y > 0 ? 1 : 0;
  return { x: parentRoom.x + rect.x + 1, y: parentRoom.y + rect.y + top, width: rect.width - 1, height: rect.height - top };
}

/** The room (below the header, inside the border) of a paper, on the page. */
export function roomBox(snapshot: PaperStoreSnapshot, id: PaperId): Box | null {
  const frame = frameBox(snapshot, id);
  const entry = snapshot.layout.entries.get(id);
  if (!frame || !entry) return null;
  const header = entry.policy.headerHeight;
  return { x: frame.x + 1, y: frame.y + 1 + header, width: Math.max(0, frame.width - 2), height: Math.max(0, frame.height - 2 - header) };
}

/**
 * jsdom has no layout. This gives the canvas element its size and every paper frame, room and
 * child card the box the canvas's own layout gave it, so hit testing works as in a browser.
 */
export function stubLayout(getHandle: () => PaperCanvasHandle | null, width = 1200, height = 800) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-paper-canvas')) return domRect({ x: 0, y: 0, width, height });
    const snapshot = getHandle()?.getSnapshot();
    if (!snapshot) return domRect({ x: 0, y: 0, width: 0, height: 0 });

    const cardId = this.getAttribute('data-child-id');
    const parentFrame = this.parentElement?.parentElement;
    if (cardId && parentFrame?.hasAttribute('data-paper-id-frame')) {
      const parentId = parentFrame.getAttribute('data-paper-id-frame')!;
      const room = roomBox(snapshot, parentId);
      const rect = snapshot.layout.entries.get(parentId)?.roomLayout.childRects.get(cardId);
      if (room && rect) return domRect({ x: room.x + rect.x, y: room.y + rect.y, width: rect.width, height: rect.height });
    }

    const frame = this.parentElement;
    if (frame?.hasAttribute('data-paper-id-frame') && this === frame.lastElementChild) {
      const room = roomBox(snapshot, frame.getAttribute('data-paper-id-frame')!);
      if (room) return domRect(room);
    }
    if (this.hasAttribute('data-paper-id-frame')) {
      const box = frameBox(snapshot, this.getAttribute('data-paper-id-frame')!);
      if (box) return domRect(box);
    }
    return domRect({ x: 0, y: 0, width: 0, height: 0 });
  });
}

export async function renderCanvas(props: PaperCanvasProps, size = { width: 1200, height: 800 }): Promise<CanvasHarness> {
  const handle = createRef<PaperCanvasHandle>();
  stubLayout(() => handle.current, size.width, size.height);
  let current = props;
  const view = render(<PaperCanvas ref={handle} {...current} />);
  await act(async () => {});
  return {
    ...view,
    handle,
    rerenderCanvas: async (next) => {
      current = { ...current, ...next };
      view.rerender(<PaperCanvas ref={handle} {...current} />);
      await act(async () => {});
    },
  };
}

/** Queues animation frames; call the returned function to run them. */
export function installRafQueue() {
  const queue: FrameRequestCallback[] = [];
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    queue.push(cb);
    return queue.length;
  });
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  return () => {
    for (const cb of queue.splice(0)) cb(performance.now());
  };
}

/** Center of a box. */
export function center(box: Box | null): { clientX: number; clientY: number } {
  if (!box) throw new Error('no box');
  return { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
}

export function pointerEvent(type: string, init: { clientX: number; clientY: number; button?: number; pointerId?: number }) {
  return new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...init });
}
