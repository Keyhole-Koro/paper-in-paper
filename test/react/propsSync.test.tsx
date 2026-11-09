import { act, cleanup, render } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaperCanvas, type PaperCanvasHandle } from '../../src/lib/react/PaperCanvas';
import type { ExpansionMap, Paper } from '../../src/lib/core/types';
import { buildPaperMap } from '../../src/lib/core/tree';
import { expansion } from '../helpers/papers';
import { renderCanvas, stubLayout } from '../helpers/render';

afterEach(cleanup);

const p = (id: string, parentId: string | null, childIds: string[] = [], title = id): Paper =>
  ({ id, title, description: '', content: <p>{id}</p>, parentId, childIds });

const full = () => buildPaperMap([p('root', null, ['ws']), p('ws', 'root', ['item']), p('item', 'ws')]);
const frame = (id: string) => document.querySelector(`[data-paper-id-frame="${id}"]`);

describe('paperMap prop', () => {
  it('follows prop updates without reporting them back', async () => {
    const onPaperMapChange = vi.fn();
    const view = await renderCanvas({ paperMap: full(), onPaperMapChange, defaultOpenState: { expansionMap: expansion({ root: ['ws'] }) } });
    const next = full();
    next.set('ws', { ...next.get('ws')!, title: 'Renamed' });
    await view.rerenderCanvas({ paperMap: next });
    expect(view.handle.current!.getState().paperMap.get('ws')!.title).toBe('Renamed');
    expect(onPaperMapChange).not.toHaveBeenCalled();
  });

  it('reports changes the canvas makes to the paper map', async () => {
    const onPaperMapChange = vi.fn();
    const map = buildPaperMap([p('root', null, ['a', 'b']), p('a', 'root'), p('b', 'root')]);
    const view = await renderCanvas({ paperMap: map, onPaperMapChange });
    await act(async () => view.handle.current!.dispatch({ type: 'MOVE_NODE', nodeId: 'b', targetParentId: 'a', insertBeforeId: null }));
    expect(onPaperMapChange).toHaveBeenCalledTimes(1);
    expect(onPaperMapChange.mock.calls[0][0].get('b').parentId).toBe('a');
  });

  it('keeps restored open state for papers that load later (no replay needed)', async () => {
    const partial = buildPaperMap([p('root', null, ['ws']), p('ws', 'root')]);
    const view = await renderCanvas({
      paperMap: partial,
      defaultOpenState: { expansionMap: expansion({ root: ['ws'], ws: ['item'] }), focusedNodeId: 'item' },
    });
    expect(frame('ws')).not.toBeNull();
    expect(frame('item')).toBeNull();
    // The host re-renders with a new but equal map, then the subtree arrives.
    await view.rerenderCanvas({ paperMap: new Map(partial) });
    await view.rerenderCanvas({ paperMap: full() });
    expect(frame('item')).not.toBeNull();
    expect(view.handle.current!.getState().focusedNodeId).toBe('item');
  });

  it('survives a restored open state that loops', async () => {
    const view = await renderCanvas({
      paperMap: full(),
      defaultOpenState: { expansionMap: expansion({ root: ['ws'], ws: ['item'], item: ['ws', 'root'] }) },
    });
    expect(frame('item')).not.toBeNull();
    expect(view.container.querySelectorAll('[data-paper-id-frame="ws"]')).toHaveLength(1);
  });
});

describe('controlled open state', () => {
  it('takes over expansionMap and focusedNodeId props without echoing them', async () => {
    const onExpansionMapChange = vi.fn();
    const onFocusedNodeIdChange = vi.fn();
    const view = await renderCanvas({
      paperMap: full(),
      expansionMap: expansion({ root: ['ws'] }),
      onExpansionMapChange,
      onFocusedNodeIdChange,
    });
    expect(frame('ws')).not.toBeNull();
    await view.rerenderCanvas({ expansionMap: expansion({ root: ['ws'], ws: ['item'] }), focusedNodeId: 'item' });
    expect(frame('item')).not.toBeNull();
    expect(view.handle.current!.getState().focusedNodeId).toBe('item');
    expect(onExpansionMapChange).not.toHaveBeenCalled();
    expect(onFocusedNodeIdChange).not.toHaveBeenCalled();

    // A change made inside the canvas is reported.
    await act(async () => view.handle.current!.dispatch({ type: 'CLOSE_NODE', parentId: 'ws', childId: 'item' }));
    expect(onExpansionMapChange).toHaveBeenCalledTimes(1);
    expect(onFocusedNodeIdChange).toHaveBeenLastCalledWith('ws');
  });
});

describe('callbacks', () => {
  it('do not fire on mount and fire once per change', async () => {
    const onExpansionMapChange = vi.fn();
    const onFocusedNodeIdChange = vi.fn();
    const view = await renderCanvas({ paperMap: full(), onExpansionMapChange, onFocusedNodeIdChange });
    expect(onExpansionMapChange).not.toHaveBeenCalled();
    expect(onFocusedNodeIdChange).not.toHaveBeenCalled();
    await act(async () => view.handle.current!.dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'ws' }));
    expect(onExpansionMapChange).toHaveBeenCalledTimes(1);
    expect((onExpansionMapChange.mock.calls[0][0] as ExpansionMap).get('root')!.openChildIds).toEqual(['ws']);
    expect(onFocusedNodeIdChange).toHaveBeenCalledWith('ws');
  });

  it('report each change once under StrictMode, which runs effects twice', async () => {
    const onExpansionMapChange = vi.fn();
    const onFocusedNodeIdChange = vi.fn();
    const handle = createRef<PaperCanvasHandle>();
    stubLayout(() => handle.current);
    render(
      <StrictMode>
        <PaperCanvas ref={handle} paperMap={full()} onExpansionMapChange={onExpansionMapChange} onFocusedNodeIdChange={onFocusedNodeIdChange} />
      </StrictMode>,
    );
    await act(async () => {});
    expect(onExpansionMapChange).not.toHaveBeenCalled();
    await act(async () => handle.current!.dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'ws' }));
    expect(onExpansionMapChange).toHaveBeenCalledTimes(1);
    expect(onFocusedNodeIdChange).toHaveBeenCalledTimes(1);
  });

  it('are not called again just because the host passed new callback functions', async () => {
    const calls: string[] = [];
    const view = await renderCanvas({ paperMap: full(), onExpansionMapChange: () => calls.push('a') });
    await view.rerenderCanvas({ onExpansionMapChange: () => calls.push('b') });
    await view.rerenderCanvas({ onExpansionMapChange: () => calls.push('c') });
    expect(calls).toEqual([]);
    await act(async () => view.handle.current!.dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'ws' }));
    expect(calls).toEqual(['c']);
  });

  it('report space-management changes too', async () => {
    const onExpansionMapChange = vi.fn();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const map = buildPaperMap([p('root', null, ids), ...ids.map((id) => p(id, 'root'))]);
    const view = await renderCanvas({ paperMap: map, onExpansionMapChange }, { width: 260, height: 300 });
    await act(async () => view.handle.current!.dispatchAll(ids.map((id) => ({ type: 'OPEN_NODE', parentId: 'root', childId: id }))));
    for (let i = 0; i < 4; i += 1) {
      await act(async () => view.handle.current!.dispatch({ type: 'FOCUS_NODE', nodeId: 'root' }));
    }
    await act(async () => view.handle.current!.dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'a' }));
    const state = view.handle.current!.getState();
    expect(state.indexedContentIds.size + (6 - state.expansionMap.get('root')!.openChildIds.length)).toBeGreaterThan(0);
  });
});

describe('config, rootId and inline props', () => {
  it('keeps the layout when the host passes an equal inline config object', async () => {
    const view = await renderCanvas({ paperMap: full(), config: { layout: { minPaperWidth: 120 } }, defaultOpenState: { expansionMap: expansion({ root: ['ws'] }) } });
    const before = view.handle.current!.getSnapshot();
    await view.rerenderCanvas({ config: { layout: { minPaperWidth: 120 } } });
    expect(view.handle.current!.getSnapshot()).toBe(before);
    await view.rerenderCanvas({ config: { paperNode: { headerHeight: 50 } } });
    expect(view.handle.current!.getSnapshot().config.paperNode.headerHeight).toBe(50);
  });

  it('renders the given root and follows rootId changes', async () => {
    const view = await renderCanvas({ paperMap: full(), rootId: 'ws' });
    expect(frame('ws')).not.toBeNull();
    expect(frame('root')).toBeNull();
    await view.rerenderCanvas({ rootId: undefined });
    expect(frame('root')).not.toBeNull();
  });
});
