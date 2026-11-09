import { describe, expect, it } from 'vitest';
import { createInitialState, reduce, type Command } from '../../src/lib/core/commands';
import { checkTreeInvariants } from '../../src/lib/core/tree';
import { close, config, expansion, focus, open, openIds, run, stateOf, tree } from '../helpers/papers';

const papers = () => tree({ root: ['a', 'b', 'c'], a: ['a1', 'a2'], a1: ['a1x'], b: ['b1'] });

describe('createInitialState', () => {
  it('starts every paper at its initial attention on clock 0', () => {
    const map = tree({ root: ['a'] }, { a: { attentionScore: 7 } });
    const state = createInitialState(map, config);
    expect(state.clock).toBe(0);
    expect(state.attentionMap.get('root')).toBe(config.attention.initial);
    expect(state.attentionMap.get('a')).toBe(7);
    expect(state.focusedNodeId).toBeNull();
  });

  it('keeps restored open state for papers that have not loaded yet, and protects them once they arrive', () => {
    let state = stateOf(tree({ root: ['ws'] }), {
      expansionMap: expansion({ root: ['ws'], ws: ['item'] }),
      focusedNodeId: 'item',
    });
    expect(openIds(state, 'ws')).toEqual(['item']);
    expect(state.focusedNodeId).toBe('item');
    expect(state.protectedUntilMap.get('ws')).toBe(config.attention.protectInteractions);
    expect(state.protectedUntilMap.has('item')).toBe(false);
    state = run(state, [{ type: 'SET_PAPER_MAP', paperMap: tree({ root: ['ws'], ws: ['item'] }) }]);
    expect(state.protectedUntilMap.get('item')).toBe(state.clock + config.attention.protectInteractions);
  });
});

describe('OPEN_NODE', () => {
  it('opens a child, focuses it, boosts it and advances the clock', () => {
    const state = run(stateOf(papers()), [open('root', 'a')]);
    expect(openIds(state, 'root')).toEqual(['a']);
    expect(state.focusedNodeId).toBe('a');
    expect(state.clock).toBe(1);
    expect(state.attentionMap.get('a')).toBeGreaterThan(config.attention.initial);
    expect(state.protectedUntilMap.get('a')).toBe(1 + config.attention.protectInteractions);
  });

  it('ignores ids that are not children of the parent', () => {
    const state = run(stateOf(papers()), [open('root', 'a')]);
    // An ancestor, a sibling's child, an unknown id: each would break the tree if opened here.
    for (const command of [open('a', 'root'), open('a', 'b1'), open('a', 'nope'), open('nope', 'a')]) {
      expect(reduce(state, command, config)).toBe(state);
    }
  });

  it('unindexes the paper it opens', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b'), { type: 'INDEX_CONTENT', nodeId: 'a' }]);
    expect(state.indexedContentIds.has('a')).toBe(true);
    expect(run(state, [open('root', 'a')]).indexedContentIds.has('a')).toBe(false);
  });
});

describe('CLOSE_NODE / CLOSE_CHILDREN / AUTO_CLOSE_NODE', () => {
  it('closes a subtree and moves focus out of what it hid', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('a', 'a1'), open('a1', 'a1x'), close('root', 'a')]);
    expect(openIds(state, 'root')).toEqual([]);
    expect(state.expansionMap.has('a')).toBe(false);
    expect(state.expansionMap.has('a1')).toBe(false);
    expect(state.focusedNodeId).toBe('root');
  });

  it('keeps focus where it is when it was not inside the closed subtree', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b'), close('root', 'a')]);
    expect(state.focusedNodeId).toBe('b');
  });

  it('forgets the indexed flag of everything it closes', () => {
    const state = run(stateOf(papers()), [
      open('root', 'a'), open('root', 'b'), open('a', 'a1'), open('a', 'a2'),
      { type: 'INDEX_CONTENT', nodeId: 'a1' }, close('root', 'a'),
    ]);
    expect(state.indexedContentIds.size).toBe(0);
  });

  it('drops a stale entry that does not match the tree without moving focus', () => {
    const base = run(stateOf(papers(), { expansionMap: expansion({ root: ['a'], a: ['b1'] }) }), [focus('a')]);
    const next = run(base, [close('a', 'b1')]);
    expect(next.expansionMap.has('a')).toBe(false);
    expect(next.focusedNodeId).toBe('a');
  });

  it('CLOSE_CHILDREN closes every open child of a paper', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b'), open('a', 'a1'), { type: 'CLOSE_CHILDREN', nodeId: 'root' }]);
    expect(state.expansionMap.size).toBe(0);
    expect(state.focusedNodeId).toBe('root');
  });

  it('AUTO_CLOSE_NODE closes a paper under its own parent and ignores the root', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b')]);
    expect(openIds(run(state, [{ type: 'AUTO_CLOSE_NODE', nodeId: 'a' }]), 'root')).toEqual(['b']);
    expect(reduce(state, { type: 'AUTO_CLOSE_NODE', nodeId: 'root' }, config)).toBe(state);
  });
});

describe('FOCUS_NODE / REVEAL_NODE / LABEL_CLICK_BOOST', () => {
  it('FOCUS_NODE focuses known papers only', () => {
    const state = stateOf(papers());
    expect(run(state, [focus('b')]).focusedNodeId).toBe('b');
    expect(reduce(state, focus('nope'), config)).toBe(state);
  });

  it('REVEAL_NODE opens the whole path down to a paper and focuses it, as one interaction', () => {
    const state = run(stateOf(papers()), [{ type: 'REVEAL_NODE', nodeId: 'a1x' }]);
    expect(openIds(state, 'root')).toEqual(['a']);
    expect(openIds(state, 'a')).toEqual(['a1']);
    expect(openIds(state, 'a1')).toEqual(['a1x']);
    expect(state.focusedNodeId).toBe('a1x');
    expect(state.clock).toBe(1);
    for (const id of ['a', 'a1', 'a1x']) expect(state.protectedUntilMap.get(id)).toBeGreaterThan(state.clock);
  });

  it('REVEAL_NODE of a visible ancestor just focuses it (what a link to a parent does)', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('a', 'a1')]);
    const revealed = run(state, [{ type: 'REVEAL_NODE', nodeId: 'a' }]);
    expect(revealed.expansionMap).toBe(state.expansionMap);
    expect(revealed.focusedNodeId).toBe('a');
  });

  it('REVEAL_NODE ignores unknown, cyclic and unplaced papers', () => {
    const state = stateOf(papers());
    expect(reduce(state, { type: 'REVEAL_NODE', nodeId: 'nope' }, config)).toBe(state);
    const withDraft = run(state, [{ type: 'CREATE_UNPLACED_NODE', id: 'draft', title: 'd', description: '', content: '' }]);
    expect(reduce(withDraft, { type: 'REVEAL_NODE', nodeId: 'draft' }, config)).toBe(withDraft);
  });

  it('LABEL_CLICK_BOOST unindexes, boosts, protects and focuses', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b'), { type: 'INDEX_CONTENT', nodeId: 'a' }]);
    const next = run(state, [{ type: 'LABEL_CLICK_BOOST', nodeId: 'a' }]);
    expect(next.indexedContentIds.has('a')).toBe(false);
    expect(next.focusedNodeId).toBe('a');
    expect(next.protectedUntilMap.get('a')).toBeGreaterThan(next.clock);
  });
});

describe('MOVE_NODE', () => {
  it('moves a paper to another parent, keeps its own open subtree, opens it there and focuses it', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('a', 'a1'), open('a1', 'a1x'), open('root', 'b')]);
    const moved = run(state, [{ type: 'MOVE_NODE', nodeId: 'a1', targetParentId: 'b', insertBeforeId: 'b1' }]);
    expect(moved.paperMap.get('a1')!.parentId).toBe('b');
    expect(moved.paperMap.get('b')!.childIds).toEqual(['a1', 'b1']);
    expect(openIds(moved, 'a')).toEqual([]);
    expect(openIds(moved, 'b')).toEqual(['a1']);
    // behavior-spec: "The expansion state of the moved node's subtree is preserved".
    expect(openIds(moved, 'a1')).toEqual(['a1x']);
    expect(moved.focusedNodeId).toBe('a1');
    expect(checkTreeInvariants(moved.paperMap)).toEqual([]);
  });

  it('refuses to move a paper into its own subtree (which would detach it into a cycle)', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('a', 'a1')]);
    for (const target of ['a', 'a1', 'a1x']) {
      expect(reduce(state, { type: 'MOVE_NODE', nodeId: 'a', targetParentId: target, insertBeforeId: null }, config)).toBe(state);
    }
    expect(reduce(state, { type: 'MOVE_NODE', nodeId: 'root', targetParentId: 'b', insertBeforeId: null }, config)).toBe(state);
  });

  it('honours the drop position in the visible order when reordering within a parent', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b'), open('root', 'c')]);
    const moved = run(state, [{ type: 'MOVE_NODE', nodeId: 'a', targetParentId: 'root', insertBeforeId: 'c' }]);
    expect(moved.paperMap.get('root')!.childIds).toEqual(['b', 'a', 'c']);
    expect(openIds(moved, 'root')).toEqual(['b', 'a', 'c']);
  });

  it('treats dropping a paper before itself as nothing, within or across parents', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b'), open('a', 'a1')]);
    expect(reduce(state, { type: 'MOVE_NODE', nodeId: 'a', targetParentId: 'root', insertBeforeId: 'a' }, config)).toBe(state);
    expect(reduce(state, { type: 'MOVE_NODE', nodeId: 'a1', targetParentId: 'b', insertBeforeId: 'a1' }, config)).toBe(state);
  });

  it('clears the pin when the paper changes parent', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('a', 'a1'), { type: 'PIN_NODE', nodeId: 'a1', minShare: 0.4 }]);
    const moved = run(state, [{ type: 'MOVE_NODE', nodeId: 'a1', targetParentId: 'b', insertBeforeId: null }]);
    expect(moved.paperMap.get('a1')!.pinnedLayout).toBeUndefined();
  });
});

describe('REORDER_WITHIN_PARENT', () => {
  it('reorders open papers without touching the paper data', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b'), open('root', 'c')]);
    const next = run(state, [{ type: 'REORDER_WITHIN_PARENT', parentId: 'root', paperId: 'c', insertBeforeId: 'a' }]);
    expect(openIds(next, 'root')).toEqual(['c', 'a', 'b']);
    expect(next.paperMap).toBe(state.paperMap);
    expect(next.focusedNodeId).toBe('c');
  });

  it('places a paper before the next open sibling when the target is closed', () => {
    const state = run(stateOf(papers()), [open('root', 'c'), open('root', 'a')]);
    // childIds order is a, b, c; b is closed, so "before b" means before c among the open ones.
    const next = run(state, [{ type: 'REORDER_WITHIN_PARENT', parentId: 'root', paperId: 'a', insertBeforeId: 'b' }]);
    expect(openIds(next, 'root')).toEqual(['a', 'c']);
  });

  it('ignores closed papers, wrong parents and no-op positions', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('root', 'b')]);
    const ignored: Command[] = [
      { type: 'REORDER_WITHIN_PARENT', parentId: 'root', paperId: 'c', insertBeforeId: null },
      { type: 'REORDER_WITHIN_PARENT', parentId: 'b', paperId: 'a', insertBeforeId: null },
      { type: 'REORDER_WITHIN_PARENT', parentId: 'root', paperId: 'a', insertBeforeId: 'a' },
      { type: 'REORDER_WITHIN_PARENT', parentId: 'root', paperId: 'a', insertBeforeId: 'b' },
    ];
    for (const command of ignored) expect(reduce(state, command, config)).toBe(state);
  });
});

describe('DELETE_NODE', () => {
  it('cascade removes the subtree, its state, and moves focus off removed papers', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), open('a', 'a1'), open('a1', 'a1x'), { type: 'INDEX_CONTENT', nodeId: 'a1' }]);
    const next = run(state, [{ type: 'DELETE_NODE', nodeId: 'a1' }]);
    expect(next.paperMap.has('a1')).toBe(false);
    expect(next.paperMap.has('a1x')).toBe(false);
    expect(next.focusedNodeId).toBe('a');
    for (const id of ['a1', 'a1x']) {
      expect(next.attentionMap.has(id)).toBe(false);
      expect(next.accessMap.has(id)).toBe(false);
      expect(next.protectedUntilMap.has(id)).toBe(false);
      expect(next.expansionMap.has(id)).toBe(false);
    }
    expect(next.indexedContentIds.has('a1')).toBe(false);
    expect(checkTreeInvariants(next.paperMap)).toEqual([]);
  });

  it('lift keeps the children, their state, and their open state in the deleted paper place', () => {
    const state = run(stateOf(papers()), [open('root', 'b'), open('root', 'a'), open('root', 'c'), open('a', 'a1'), open('a1', 'a1x')]);
    const next = run(state, [{ type: 'DELETE_NODE', nodeId: 'a', mode: 'lift' }]);
    expect(next.paperMap.get('root')!.childIds).toEqual(['a1', 'a2', 'b', 'c']);
    expect(openIds(next, 'root')).toEqual(['b', 'a1', 'c']);
    expect(openIds(next, 'a1')).toEqual(['a1x']);
    expect(next.attentionMap.has('a1')).toBe(true);
    expect(next.accessMap.has('a2')).toBe(true);
    expect(checkTreeInvariants(next.paperMap)).toEqual([]);
  });

  it('keeps the root and deletes unplaced papers', () => {
    const state = run(stateOf(papers()), [{ type: 'CREATE_UNPLACED_NODE', id: 'draft', title: 'd', description: '', content: '' }]);
    expect(reduce(state, { type: 'DELETE_NODE', nodeId: 'root' }, config)).toBe(state);
    const next = run(state, [{ type: 'DELETE_NODE', nodeId: 'draft' }]);
    expect(next.paperMap.has('draft')).toBe(false);
    expect(next.unplacedNodeIds).toEqual([]);
  });
});

describe('create, patch, upsert, merge', () => {
  it('CREATE_CHILD_NODE uses the given id, opens and focuses the new paper, and refuses duplicates', () => {
    const state = run(stateOf(papers()), [
      { type: 'CREATE_CHILD_NODE', id: 'n1', parentId: 'b', title: 'N', description: '', content: 'x', hue: 30 },
    ]);
    expect(state.paperMap.get('b')!.childIds).toEqual(['b1', 'n1']);
    expect(state.paperMap.get('n1')).toMatchObject({ parentId: 'b', hue: 30 });
    expect(openIds(state, 'b')).toEqual(['n1']);
    expect(state.focusedNodeId).toBe('n1');
    expect(state.protectedUntilMap.get('n1')).toBeGreaterThan(state.clock);
    expect(reduce(state, { type: 'CREATE_CHILD_NODE', id: 'n1', parentId: 'b', title: 'N', description: '', content: '' }, config)).toBe(state);
  });

  it('CREATE_CHILD_NODE generates an id when none is given', () => {
    const state = reduce(stateOf(papers()), { type: 'CREATE_CHILD_NODE', parentId: 'b', title: 'N', description: '', content: '' }, config, { createId: () => 'generated' });
    expect(state.paperMap.has('generated')).toBe(true);
  });

  it('CREATE_UNPLACED_NODE adds a parentless paper to the unplaced list', () => {
    const state = run(stateOf(papers()), [{ type: 'CREATE_UNPLACED_NODE', id: 'u', title: 'u', description: '', content: '' }]);
    expect(state.unplacedNodeIds).toEqual(['u']);
    expect(state.paperMap.get('u')!.parentId).toBeNull();
  });

  it('PATCH_NODE cannot change the tree links and resets attention when it sets attentionScore', () => {
    const state = run(stateOf(papers()), [
      { type: 'PATCH_NODE', nodeId: 'a', patch: { title: 'A!', attentionScore: 3, ...({ parentId: 'b', childIds: [] } as object) } },
    ]);
    expect(state.paperMap.get('a')).toMatchObject({ title: 'A!', parentId: 'root', childIds: ['a1', 'a2'] });
    expect(state.attentionMap.get('a')).toBe(3);
  });

  it('UPSERT_PAPERS adds papers with initial attention and keeps earned attention of existing ones', () => {
    const earned = run(stateOf(papers()), [open('root', 'a')]);
    const next = run(earned, [{ type: 'UPSERT_PAPERS', papers: [
      { ...earned.paperMap.get('a')!, title: 'renamed' },
      { id: 'z', title: 'z', description: '', content: '', parentId: 'c', childIds: [] },
    ] }]);
    expect(next.attentionMap.get('a')).toBe(earned.attentionMap.get('a'));
    expect(next.attentionMap.get('z')).toBe(config.attention.initial);
  });

  it('MERGE_PAPERS unions children and keeps the existing parent when none is given', () => {
    const next = run(stateOf(papers()), [{ type: 'MERGE_PAPERS', papers: [
      { id: 'b', title: 'B', description: '', content: '', parentId: null, childIds: ['b2'] },
    ] }]);
    expect(next.paperMap.get('b')).toMatchObject({ title: 'B', parentId: 'root', childIds: ['b1', 'b2'] });
  });
});

describe('INDEX_CONTENT / UNINDEX_CONTENT / PIN', () => {
  it('indexes only open, non-root papers', () => {
    const state = run(stateOf(papers()), [open('root', 'a')]);
    expect(run(state, [{ type: 'INDEX_CONTENT', nodeId: 'a' }]).indexedContentIds.has('a')).toBe(true);
    expect(reduce(state, { type: 'INDEX_CONTENT', nodeId: 'root' }, config)).toBe(state);
    expect(reduce(state, { type: 'INDEX_CONTENT', nodeId: 'b' }, config)).toBe(state);
  });

  it('protects a paper the reader unindexed', () => {
    const state = run(stateOf(papers()), [open('root', 'a'), { type: 'INDEX_CONTENT', nodeId: 'a' }, { type: 'UNINDEX_CONTENT', nodeId: 'a' }]);
    expect(state.indexedContentIds.has('a')).toBe(false);
    expect(state.protectedUntilMap.get('a')).toBeGreaterThan(state.clock);
  });

  it('pins with a clamped share and unpins', () => {
    const pinned = run(stateOf(papers()), [{ type: 'PIN_NODE', nodeId: 'a', minShare: 5 }]);
    expect(pinned.paperMap.get('a')!.pinnedLayout?.minShare).toBe(0.9);
    const defaulted = run(stateOf(papers()), [{ type: 'PIN_NODE', nodeId: 'a' }]);
    expect(defaulted.paperMap.get('a')!.pinnedLayout?.minShare).toBe(0.3);
    expect(run(pinned, [{ type: 'UNPIN_NODE', nodeId: 'a' }]).paperMap.get('a')!.pinnedLayout).toBeUndefined();
    const unpinned = stateOf(papers());
    expect(reduce(unpinned, { type: 'UNPIN_NODE', nodeId: 'a' }, config)).toBe(unpinned);
  });
});

describe('SET_PAPER_MAP', () => {
  it('keeps the state when the map has the same papers', () => {
    const state = stateOf(papers());
    expect(reduce(state, { type: 'SET_PAPER_MAP', paperMap: new Map(state.paperMap) }, config)).toBe(state);
    expect(reduce(state, { type: '__SYNC_PAPER_MAP', paperMap: state.paperMap }, config)).toBe(state);
  });

  it('keeps open state for papers that have not arrived yet, so restored state comes alive later', () => {
    const partial = tree({ root: ['ws'] });
    let state = stateOf(partial, { expansionMap: expansion({ root: ['ws'], ws: ['item'] }), focusedNodeId: 'item' });
    state = run(state, [{ type: 'SET_PAPER_MAP', paperMap: new Map(partial) }]);
    expect(openIds(state, 'ws')).toEqual(['item']);
    expect(state.focusedNodeId).toBe('item');
    state = run(state, [{ type: 'SET_PAPER_MAP', paperMap: tree({ root: ['ws'], ws: ['item'] }) }]);
    expect(openIds(state, 'ws')).toEqual(['item']);
    expect(state.attentionMap.has('item')).toBe(true);
  });

  it('forgets papers that disappeared and moves focus to their old parent', () => {
    let state = run(stateOf(papers()), [open('root', 'a'), open('a', 'a1'), open('a1', 'a1x')]);
    state = run(state, [{ type: 'SET_PAPER_MAP', paperMap: tree({ root: ['a', 'b', 'c'], a: ['a1', 'a2'], b: ['b1'] }) }]);
    expect(state.focusedNodeId).toBe('a1');
    expect(state.expansionMap.has('a1')).toBe(false);
    expect(state.attentionMap.has('a1x')).toBe(false);
  });

  it('moves focus to the nearest ancestor that survives when a whole branch disappears', () => {
    let state = run(stateOf(papers()), [open('root', 'a'), open('a', 'a1'), open('a1', 'a1x')]);
    state = run(state, [{ type: 'SET_PAPER_MAP', paperMap: tree({ root: ['b', 'c'], b: ['b1'] }) }]);
    expect(state.focusedNodeId).toBe('root');
  });

  it('resets attention only for papers whose attentionScore changed', () => {
    let state = run(stateOf(tree({ root: ['a', 'b'] }, { a: { attentionScore: 40 } })), [open('root', 'a'), open('root', 'b')]);
    const earned = state.attentionMap.get('a');
    state = run(state, [{ type: 'SET_PAPER_MAP', paperMap: tree({ root: ['a', 'b'] }, { a: { attentionScore: 40, title: 'x' } }) }]);
    expect(state.attentionMap.get('a')).toBe(earned);
    state = run(state, [{ type: 'SET_PAPER_MAP', paperMap: tree({ root: ['a', 'b'] }, { a: { attentionScore: 10 } }) }]);
    expect(state.attentionMap.get('a')).toBe(10);
  });
});

describe('SET_OPEN_STATE / SET_UNPLACED', () => {
  it('replaces open state without focusing or boosting anything', () => {
    const state = stateOf(papers());
    const next = run(state, [{ type: 'SET_OPEN_STATE', expansionMap: expansion({ root: ['a', 'b'] }) }]);
    expect(openIds(next, 'root')).toEqual(['a', 'b']);
    expect(next.focusedNodeId).toBeNull();
    expect(next.clock).toBe(0);
    expect(next.protectedUntilMap.get('a')).toBeGreaterThan(next.clock);
  });

  it('keeps the state when nothing changes', () => {
    const state = run(stateOf(papers()), [open('root', 'a')]);
    expect(reduce(state, { type: 'SET_OPEN_STATE', expansionMap: expansion({ root: ['a'] }) }, config)).toBe(state);
    expect(reduce(state, { type: '__SYNC_OPEN_STATE', focusedNodeId: 'a' }, config)).toBe(state);
  });

  it('sets focus alone, and sets the unplaced list', () => {
    const state = stateOf(papers());
    expect(run(state, [{ type: 'SET_OPEN_STATE', focusedNodeId: 'b' }]).focusedNodeId).toBe('b');
    const ids = ['x'];
    expect(run(state, [{ type: 'SET_UNPLACED', unplacedNodeIds: ids }]).unplacedNodeIds).toBe(ids);
  });
});

describe('ATTACH_UNPLACED_NODE', () => {
  it('attaches an unplaced paper and opens it at the position', () => {
    let state = run(stateOf(papers()), [open('root', 'a'), open('root', 'c')]);
    state = run(state, [{ type: 'CREATE_UNPLACED_NODE', id: 'u', title: 'u', description: '', content: '' }]);
    state = run(state, [{ type: 'ATTACH_UNPLACED_NODE', nodeId: 'u', targetParentId: 'root', insertBeforeId: 'c' }]);
    expect(state.unplacedNodeIds).toEqual([]);
    expect(state.paperMap.get('root')!.childIds).toEqual(['a', 'b', 'u', 'c']);
    expect(openIds(state, 'root')).toEqual(['a', 'u', 'c']);
    expect(state.focusedNodeId).toBe('u');
  });

  it('refuses papers that are not unplaced', () => {
    const state = stateOf(papers());
    expect(reduce(state, { type: 'ATTACH_UNPLACED_NODE', nodeId: 'a1', targetParentId: 'b', insertBeforeId: null }, config)).toBe(state);
  });
});

describe('unknown commands', () => {
  it('return the state unchanged', () => {
    const state = stateOf(papers());
    expect(reduce(state, { type: 'NOPE' } as unknown as Command, config)).toBe(state);
  });
});
