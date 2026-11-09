import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Paper } from '../../src/lib/core/types';
import { buildPaperMap } from '../../src/lib/core/tree';
import { expansion } from '../helpers/papers';
import { renderCanvas } from '../helpers/render';

afterEach(cleanup);

function paper(id: string, parentId: string | null, childIds: string[], content: Paper['content'] = <p>{id} body</p>): Paper {
  return { id, title: `Title ${id}`, description: '', content, parentId, childIds };
}

function sample(extra: Paper[] = []) {
  return buildPaperMap([
    paper('root', null, ['a', 'b'], (
      <p>
        <button type="button" data-paper-id="a">open a</button>
        <button type="button" data-paper-id="a1">reveal a1</button>
        <button type="button" data-paper-id="ghost">nothing</button>
      </p>
    )),
    paper('a', 'root', ['a1'], (
      <p>
        <button type="button" data-paper-id="a1">open a1</button>
        <span role="link" tabIndex={0} data-paper-id="root">back to root</span>
      </p>
    )),
    paper('a1', 'a', []),
    paper('b', 'root', []),
    ...extra,
  ]);
}

const frame = (id: string) => document.querySelector<HTMLElement>(`[data-paper-id-frame="${id}"]`);
const header = (id: string) => frame(id)!.firstElementChild as HTMLElement;
const isOpenOnScreen = (id: string) => frame(id) !== null;

describe('PaperCanvas', () => {
  it('renders the root paper and opens children through the handle', async () => {
    const { handle } = await renderCanvas({ paperMap: sample() });
    expect(isOpenOnScreen('root')).toBe(true);
    expect(isOpenOnScreen('a')).toBe(false);
    await act(async () => handle.current!.dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'a' }));
    expect(isOpenOnScreen('a')).toBe(true);
    expect(document.querySelector('[data-child-id="a"]')).not.toBeNull();
  });

  it('renders nothing (and does not throw) for an empty map or an unknown root', async () => {
    const empty = await renderCanvas({ paperMap: new Map() });
    expect(empty.container.querySelector('[data-paper-id-frame]')).toBeNull();
    cleanup();
    const unknown = await renderCanvas({ paperMap: sample(), rootId: 'missing' });
    expect(unknown.container.querySelector('[data-paper-id-frame]')).toBeNull();
  });

  it('follows data-paper-id links in React content: children open, other papers are revealed, unknown ids are ignored', async () => {
    const { handle } = await renderCanvas({ paperMap: sample() });
    fireEvent.click(screen.getByText('open a'));
    expect(isOpenOnScreen('a')).toBe(true);
    expect(handle.current!.getState().focusedNodeId).toBe('a');

    fireEvent.click(screen.getByText('nothing'));
    expect(handle.current!.getState().focusedNodeId).toBe('a');

    // A link to the parent used to overflow the stack; now it just focuses the parent.
    fireEvent.click(screen.getByText('back to root'));
    expect(handle.current!.getState().focusedNodeId).toBe('root');
    expect(isOpenOnScreen('a')).toBe(true);

    // A link to a grandchild reveals it where it lives.
    await act(async () => handle.current!.dispatch({ type: 'CLOSE_NODE', parentId: 'root', childId: 'a' }));
    fireEvent.click(screen.getByText('reveal a1'));
    expect(isOpenOnScreen('a')).toBe(true);
    expect(isOpenOnScreen('a1')).toBe(true);
    expect(handle.current!.getState().focusedNodeId).toBe('a1');
  });

  it('follows links with the keyboard', async () => {
    const { handle } = await renderCanvas({ paperMap: sample(), defaultOpenState: { expansionMap: expansion({ root: ['a'] }) } });
    fireEvent.keyDown(screen.getByText('open a1'), { key: 'Enter' });
    expect(isOpenOnScreen('a1')).toBe(true);
    fireEvent.keyDown(screen.getByText('back to root'), { key: ' ' });
    expect(handle.current!.getState().focusedNodeId).toBe('root');
  });

  it('follows links in structured content', async () => {
    const map = sample();
    map.set('root', { ...map.get('root')!, content: [
      { type: 'paragraph', children: [{ type: 'paper-link', paperId: 'b', label: 'go to b' }] },
      { type: 'card', paperId: 'a', title: 'card a', description: 'desc' },
    ] });
    await renderCanvas({ paperMap: map });
    fireEvent.click(screen.getByText('go to b'));
    expect(isOpenOnScreen('b')).toBe(true);
    fireEvent.keyDown(screen.getByText('card a').closest('[role="button"]')!, { key: 'Enter' });
    expect(isOpenOnScreen('a')).toBe(true);
  });

  it('pressing a header focuses the paper; the title is a button that focuses it from the keyboard', async () => {
    const { handle } = await renderCanvas({ paperMap: sample(), defaultOpenState: { expansionMap: expansion({ root: ['a', 'b'] }) } });
    fireEvent.pointerDown(header('b'), { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(header('b'), { button: 0, clientX: 5, clientY: 5 });
    expect(handle.current!.getState().focusedNodeId).toBe('b');

    const title = within(header('a')).getByRole('button', { name: 'Title a' });
    fireEvent.click(title, { detail: 0 });
    expect(handle.current!.getState().focusedNodeId).toBe('a');
    expect(title.getAttribute('aria-current')).toBe('true');
  });

  it('closes a paper with its close button and focuses the parent', async () => {
    const { handle } = await renderCanvas({ paperMap: sample(), defaultOpenState: { expansionMap: expansion({ root: ['a'], a: ['a1'] }) } });
    fireEvent.click(within(header('a')).getByRole('button', { name: 'Close paper' }));
    expect(isOpenOnScreen('a')).toBe(false);
    expect(isOpenOnScreen('a1')).toBe(false);
    expect(handle.current!.getState().focusedNodeId).toBe('root');
  });

  it("the parent crumb closes everything open inside the parent and focuses it", async () => {
    const { handle } = await renderCanvas({ paperMap: sample(), defaultOpenState: { expansionMap: expansion({ root: ['a', 'b'], a: ['a1'] }) } });
    const crumb = within(header('a1')).getByRole('button', { name: 'Title a' });
    expect(crumb.getAttribute('title')).toBe('Back to Title a');
    fireEvent.click(crumb);
    expect(isOpenOnScreen('a1')).toBe(false);
    expect(isOpenOnScreen('b')).toBe(true);
    expect(handle.current!.getState().focusedNodeId).toBe('a');
  });

  it('pins and unpins a paper', async () => {
    const { handle } = await renderCanvas({ paperMap: sample(), defaultOpenState: { expansionMap: expansion({ root: ['a', 'b'] }) } });
    const pin = within(header('a')).getByRole('button', { name: 'Pin paper' });
    expect(pin.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pin);
    expect(handle.current!.getState().paperMap.get('a')!.pinnedLayout?.minShare).toBeGreaterThan(0);
    fireEvent.click(within(header('a')).getByRole('button', { name: 'Unpin paper' }));
    expect(handle.current!.getState().paperMap.get('a')!.pinnedLayout).toBeUndefined();
  });

  it('adds a child through onCreateChild, with the id the host chose', async () => {
    const onCreateChild = vi.fn((parentId: string, create: (node: { title: string; content: string; id?: string }) => void) => {
      create({ id: `${parentId}-new`, title: 'New', content: '<p>x</p>' });
    });
    const { handle } = await renderCanvas({ paperMap: sample(), onCreateChild });
    fireEvent.click(within(header('root')).getByRole('button', { name: 'Add a child paper' }));
    expect(onCreateChild).toHaveBeenCalledWith('root', expect.any(Function));
    expect(handle.current!.getState().paperMap.get('root-new')).toMatchObject({ title: 'New', parentId: 'root' });
    expect(isOpenOnScreen('root-new')).toBe(true);
  });

  it('hides the add button without onCreateChild and translates labels', async () => {
    await renderCanvas({
      paperMap: sample(),
      defaultOpenState: { expansionMap: expansion({ root: ['a'] }) },
      labels: { closePaper: '閉じる', pinPaper: 'ピン留め', collapseTo: (t) => `${t} に戻る` },
    });
    expect(within(header('root')).queryByRole('button', { name: 'Add a child paper' })).toBeNull();
    expect(within(header('a')).getByRole('button', { name: '閉じる' })).toBeTruthy();
    expect(within(header('a')).getByRole('button', { name: 'ピン留め' })).toBeTruthy();
    expect(within(header('a')).getByRole('button', { name: 'Title root' }).getAttribute('title')).toBe('Title root に戻る');
  });

  it('moves a paper among its open siblings with Alt + arrow keys', async () => {
    const map = sample([paper('c', 'root', [])]);
    map.set('root', { ...map.get('root')!, childIds: ['a', 'b', 'c'] });
    const { handle } = await renderCanvas({ paperMap: map, defaultOpenState: { expansionMap: expansion({ root: ['a', 'b', 'c'] }) } });
    const title = within(header('c')).getByRole('button', { name: 'Title c' });
    expect(title.getAttribute('aria-description')).toMatch(/Alt/);
    fireEvent.keyDown(title, { key: 'ArrowLeft', altKey: true });
    expect(handle.current!.getState().expansionMap.get('root')!.openChildIds).toEqual(['a', 'c', 'b']);
    fireEvent.keyDown(within(header('a')).getByRole('button', { name: 'Title a' }), { key: 'ArrowDown', altKey: true });
    expect(handle.current!.getState().expansionMap.get('root')!.openChildIds).toEqual(['c', 'a', 'b']);
    // Without Alt nothing moves.
    fireEvent.keyDown(title, { key: 'ArrowLeft' });
    expect(handle.current!.getState().expansionMap.get('root')!.openChildIds).toEqual(['c', 'a', 'b']);
  });

  it('reorders papers without moving their elements, so content frames do not reload', async () => {
    const map = sample([paper('c', 'root', [], '<p>c as html</p>')]);
    map.set('root', { ...map.get('root')!, childIds: ['a', 'b', 'c'] });
    const { handle } = await renderCanvas({ paperMap: map, defaultOpenState: { expansionMap: expansion({ root: ['a', 'b', 'c'] }) } });
    const cards = () => Array.from(frame('root')!.querySelectorAll<HTMLElement>(':scope > div:last-child > [data-child-id]'));
    const before = cards();
    const iframe = document.querySelector('iframe[data-paper-content-id="c"]');
    expect(before.map((el) => [el.dataset.childId, el.dataset.childIndex])).toEqual([['a', '0'], ['b', '1'], ['c', '2']]);

    await act(async () => handle.current!.dispatch({ type: 'REORDER_WITHIN_PARENT', parentId: 'root', paperId: 'c', insertBeforeId: 'a' }));
    const after = cards();
    // Same elements, same DOM order; only the layout index (and the rects) changed.
    expect(after).toEqual(before);
    expect(after.map((el) => [el.dataset.childId, el.dataset.childIndex])).toEqual([['a', '1'], ['b', '2'], ['c', '0']]);
    expect(document.querySelector('iframe[data-paper-content-id="c"]')).toBe(iframe);
  });

  it('does not reorder when dragging is off or the host vetoes it', async () => {
    const map = sample();
    const first = await renderCanvas({ paperMap: map, draggable: false, defaultOpenState: { expansionMap: expansion({ root: ['a', 'b'] }) } });
    const title = within(header('b')).getByRole('button', { name: 'Title b' });
    expect(title.getAttribute('aria-description')).toBeNull();
    fireEvent.keyDown(title, { key: 'ArrowLeft', altKey: true });
    expect(first.handle.current!.getState().expansionMap.get('root')!.openChildIds).toEqual(['a', 'b']);
    cleanup();

    const vetoed = await renderCanvas({ paperMap: map, canDrop: () => false, defaultOpenState: { expansionMap: expansion({ root: ['a', 'b'] }) } });
    fireEvent.keyDown(within(header('b')).getByRole('button', { name: 'Title b' }), { key: 'ArrowLeft', altKey: true });
    expect(vetoed.handle.current!.getState().expansionMap.get('root')!.openChildIds).toEqual(['a', 'b']);
  });

  it('shows index labels for indexed papers and brings a paper back when its label is clicked', async () => {
    const { handle } = await renderCanvas({ paperMap: sample(), defaultOpenState: { expansionMap: expansion({ root: ['a', 'b'] }) } });
    await act(async () => handle.current!.dispatch({ type: 'INDEX_CONTENT', nodeId: 'a' }));
    const label = document.querySelector<HTMLButtonElement>('[data-index-label="a"]')!;
    expect(label.textContent).toBe('Title a');
    expect(header('a').querySelector('button')).toBeNull(); // indexed papers have no header
    fireEvent.click(label);
    expect(handle.current!.getState().indexedContentIds.has('a')).toBe(false);
    expect(handle.current!.getState().focusedNodeId).toBe('a');
    expect(document.querySelector('[data-index-label="a"]')).toBeNull();
  });

  it('renders dark tones and a debug overlay when asked', async () => {
    await renderCanvas({ paperMap: sample(), colorScheme: 'dark', debug: true });
    // jsdom normalises colours to rgb(); a dark surface has every channel low.
    const channels = frame('root')!.style.background.match(/\d+/g)!.slice(0, 3).map(Number);
    expect(Math.max(...channels)).toBeLessThan(60);
    expect(document.body.textContent).toMatch(/debug/);
  });

  it('reveals a paper through the handle', async () => {
    const { handle } = await renderCanvas({ paperMap: sample() });
    await act(async () => handle.current!.revealNode('a1'));
    expect(isOpenOnScreen('a1')).toBe(true);
    expect(handle.current!.getSnapshot().layout.entries.has('a1')).toBe(true);
  });
});
