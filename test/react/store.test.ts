import { describe, expect, it, vi } from 'vitest';
import { createPaperStore } from '../../src/lib/react/store/createPaperStore';
import { config, focus, makeConfig, open, run, stateOf, tree } from '../helpers/papers';

const papers = () => tree({ root: ['a', 'b', 'c', 'd', 'e', 'f'] });

describe('createPaperStore', () => {
  it('starts without a layout until it knows the canvas size, and finds the root', () => {
    const store = createPaperStore({ state: stateOf(papers()), config });
    expect(store.getSnapshot().rootId).toBe('root');
    expect(store.getSnapshot().layout.entries.size).toBe(0);
    store.setCanvasSize({ width: 800, height: 600 });
    expect(store.getSnapshot().layout.entries.has('root')).toBe(true);
  });

  it('notifies once per change, and not at all for commands that change nothing', () => {
    const store = createPaperStore({ state: stateOf(papers()), config });
    store.setCanvasSize({ width: 800, height: 600 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch(open('root', 'nope'));
    expect(listener).not.toHaveBeenCalled();
    store.dispatchAll([open('root', 'a'), open('root', 'b'), open('root', 'c')]);
    expect(listener).toHaveBeenCalledTimes(1);
    store.setCanvasSize({ width: 800.2, height: 599.8 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the snapshot object while nothing changes', () => {
    const store = createPaperStore({ state: stateOf(papers()), config });
    store.setCanvasSize({ width: 800, height: 600 });
    const snapshot = store.getSnapshot();
    store.dispatch(focus('nope'));
    expect(store.getSnapshot()).toBe(snapshot);
  });

  it('settles space before subscribers see a change', () => {
    let state = run(stateOf(papers()), ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => open('root', id)));
    for (let i = 0; i < 4; i += 1) state = run(state, [focus('root')]);
    const store = createPaperStore({ state, config });
    const seen: number[] = [];
    store.subscribe(() => seen.push(store.getState().indexedContentIds.size));
    store.setCanvasSize({ width: 320, height: 480 });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeGreaterThan(0);
  });

  it('renders an explicit root, nothing for an unknown one, and follows config changes', () => {
    const store = createPaperStore({ state: run(stateOf(papers()), [open('root', 'a')]), config, rootId: 'a' });
    store.setCanvasSize({ width: 800, height: 600 });
    expect([...store.getSnapshot().layout.entries.keys()]).toEqual(['a']);
    store.setRootId('nope');
    expect(store.getSnapshot().layout.entries.size).toBe(0);
    store.setRootId(undefined);
    expect(store.getSnapshot().rootId).toBe('root');
    const before = store.getSnapshot().layout.entries.get('root')!;
    store.setConfig(makeConfig({ paperNode: { headerHeight: 60 } }));
    expect(store.getSnapshot().layout.entries.get('root')).not.toBe(before);
    expect(store.getSnapshot().config.paperNode.headerHeight).toBe(60);
  });

  it('builds index labels for indexed papers and keeps them stable while unchanged', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b'), { type: 'INDEX_CONTENT', nodeId: 'a' }]);
    const store = createPaperStore({ state, config });
    store.setCanvasSize({ width: 1200, height: 800 });
    const labels = store.getSnapshot().indexLabels;
    expect(labels.map((l) => l.id)).toEqual(['a']);
    store.dispatch({ type: 'PATCH_NODE', nodeId: 'c', patch: { description: 'x' } });
    expect(store.getSnapshot().indexLabels).toBe(labels);
  });

  it('lets a subscriber unsubscribe while being notified', () => {
    const store = createPaperStore({ state: stateOf(papers()), config });
    const second = vi.fn();
    const unsubscribe = store.subscribe(() => unsubscribe());
    store.subscribe(second);
    store.setCanvasSize({ width: 100, height: 100 });
    store.setCanvasSize({ width: 200, height: 100 });
    expect(second).toHaveBeenCalledTimes(2);
  });
});
