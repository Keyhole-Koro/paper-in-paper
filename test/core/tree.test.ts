import { describe, expect, it } from 'vitest';
import {
  addChild,
  canMoveNode,
  checkTreeInvariants,
  findRootId,
  getAncestorIds,
  getDescendantIds,
  insertBefore,
  isSelfOrAncestor,
  moveNode,
  removeNode,
} from '../../src/lib/core/tree';
import type { PaperMap } from '../../src/lib/core/types';
import { tree } from '../helpers/papers';

const sample = () => tree({ root: ['a', 'b'], a: ['a1', 'a2'], a1: ['a1x'], b: ['b1'] });

/** a → b → a, detached from the root. */
function cyclic(): PaperMap {
  const map = tree({ root: ['a'], a: ['b'] });
  map.set('a', { ...map.get('a')!, parentId: 'b' });
  map.set('b', { ...map.get('b')!, childIds: ['a'] });
  return map;
}

describe('findRootId', () => {
  it('finds the parentless paper', () => {
    expect(findRootId(sample())).toBe('root');
  });

  it('returns null for an empty map instead of throwing', () => {
    expect(findRootId(new Map())).toBeNull();
  });

  it('skips parentless papers waiting in the unplaced list', () => {
    const map = sample();
    map.set('draft', { id: 'draft', title: 'draft', description: '', content: '', parentId: null, childIds: [] });
    const reordered = new Map([['draft', map.get('draft')!], ...Array.from(map).filter(([id]) => id !== 'draft')]);
    expect(findRootId(reordered, ['draft'])).toBe('root');
  });
});

describe('getDescendantIds', () => {
  it('lists everything below a paper, not the paper itself', () => {
    expect(getDescendantIds(sample(), 'a').sort()).toEqual(['a1', 'a1x', 'a2']);
    expect(getDescendantIds(sample(), 'a1x')).toEqual([]);
  });

  it('terminates on a cycle', () => {
    expect(getDescendantIds(cyclic(), 'a').sort()).toEqual(['b']);
  });

  it('visits a child listed by two parents once', () => {
    const map = tree({ root: ['a', 'b'], a: ['c'] });
    map.set('b', { ...map.get('b')!, childIds: ['c'] });
    expect(getDescendantIds(map, 'root').sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('ancestry', () => {
  it('isSelfOrAncestor walks parent links', () => {
    const map = sample();
    expect(isSelfOrAncestor(map, 'a', 'a1x')).toBe(true);
    expect(isSelfOrAncestor(map, 'a1x', 'a1x')).toBe(true);
    expect(isSelfOrAncestor(map, 'b', 'a1x')).toBe(false);
    expect(isSelfOrAncestor(cyclic(), 'root', 'a')).toBe(false);
  });

  it('getAncestorIds returns the chain from the root, or null when it is broken', () => {
    expect(getAncestorIds(sample(), 'a1x')).toEqual(['root', 'a', 'a1']);
    expect(getAncestorIds(sample(), 'root')).toEqual([]);
    expect(getAncestorIds(cyclic(), 'a')).toBeNull();
    const orphan = sample();
    orphan.set('x', { id: 'x', title: 'x', description: '', content: '', parentId: 'gone', childIds: [] });
    expect(getAncestorIds(orphan, 'x')).toBeNull();
    expect(getAncestorIds(orphan, 'missing')).toBeNull();
  });
});

describe('insertBefore', () => {
  it('inserts before an id, appends for null or unknown ids, and never duplicates', () => {
    expect(insertBefore(['a', 'b', 'c'], 'x', 'b')).toEqual(['a', 'x', 'b', 'c']);
    expect(insertBefore(['a', 'b'], 'x', null)).toEqual(['a', 'b', 'x']);
    expect(insertBefore(['a', 'b'], 'x', 'nope')).toEqual(['a', 'b', 'x']);
    expect(insertBefore(['a', 'x', 'b'], 'x', 'a')).toEqual(['x', 'a', 'b']);
  });
});

describe('addChild', () => {
  it('adds at a position and sets the parent', () => {
    const map = addChild(sample(), 'b', { id: 'n', title: 'n', description: '', content: '', parentId: null, childIds: [] }, 'b1');
    expect(map.get('b')!.childIds).toEqual(['n', 'b1']);
    expect(map.get('n')!.parentId).toBe('b');
  });

  it('ignores a missing parent or a paper added to itself', () => {
    const map = sample();
    expect(addChild(map, 'missing', map.get('a')!, null)).toBe(map);
    expect(addChild(map, 'a', map.get('a')!, null)).toBe(map);
  });
});

describe('removeNode', () => {
  it('cascade removes the whole subtree', () => {
    const map = removeNode(sample(), 'a');
    expect([...map.keys()].sort()).toEqual(['b', 'b1', 'root']);
    expect(map.get('root')!.childIds).toEqual(['b']);
  });

  it('lift moves the children up into the paper position', () => {
    const map = removeNode(sample(), 'a', 'lift');
    expect(map.has('a')).toBe(false);
    expect(map.get('root')!.childIds).toEqual(['a1', 'a2', 'b']);
    expect(map.get('a1')!.parentId).toBe('root');
    expect(map.get('a1x')!.parentId).toBe('a1');
    expect(checkTreeInvariants(map)).toEqual([]);
  });

  it('is a no-op for an unknown id', () => {
    const map = sample();
    expect(removeNode(map, 'zzz')).toBe(map);
  });
});

describe('moveNode', () => {
  it('moves a subtree under another parent before a sibling', () => {
    const map = moveNode(sample(), 'a1', 'b', 'b1');
    expect(map.get('a')!.childIds).toEqual(['a2']);
    expect(map.get('b')!.childIds).toEqual(['a1', 'b1']);
    expect(map.get('a1')!.parentId).toBe('b');
    expect(map.get('a1x')!.parentId).toBe('a1');
    expect(checkTreeInvariants(map)).toEqual([]);
  });

  it('reorders within the same parent', () => {
    const map = moveNode(sample(), 'a2', 'a', 'a1');
    expect(map.get('a')!.childIds).toEqual(['a2', 'a1']);
  });

  it('refuses to move a paper into itself or its own subtree', () => {
    const map = sample();
    expect(canMoveNode(map, 'a', 'a')).toBe(false);
    expect(canMoveNode(map, 'a', 'a1')).toBe(false);
    expect(canMoveNode(map, 'a', 'a1x')).toBe(false);
    expect(moveNode(map, 'a', 'a1x', null)).toBe(map);
    expect(moveNode(map, 'a', 'a', null)).toBe(map);
  });

  it('refuses to move the root, an unknown paper, or to an unknown parent', () => {
    const map = sample();
    expect(moveNode(map, 'root', 'b', null)).toBe(map);
    expect(moveNode(map, 'zzz', 'b', null)).toBe(map);
    expect(moveNode(map, 'a1', 'zzz', null)).toBe(map);
  });

  it('keeps the map when dropping a paper before itself or where it already is', () => {
    const map = sample();
    expect(moveNode(map, 'a1', 'a', 'a1')).toBe(map);
    expect(moveNode(map, 'a1', 'a', 'a2')).toBe(map);
  });
});

describe('checkTreeInvariants', () => {
  it('passes a well-formed tree', () => {
    expect(checkTreeInvariants(sample())).toEqual([]);
  });

  it('reports cycles, missing parents, mismatched links, duplicates and extra roots', () => {
    expect(checkTreeInvariants(cyclic()).join('\n')).toMatch(/loops/);

    const broken = sample();
    broken.set('x', { id: 'x', title: 'x', description: '', content: '', parentId: 'gone', childIds: [] });
    broken.set('b', { ...broken.get('b')!, childIds: ['b1', 'b1', 'a2'] });
    broken.set('extra', { id: 'extra', title: 'extra', description: '', content: '', parentId: null, childIds: [] });
    const problems = checkTreeInvariants(broken).join('\n');
    expect(problems).toMatch(/x: parent gone is missing/);
    expect(problems).toMatch(/b: lists b1 twice/);
    expect(problems).toMatch(/b: lists a2, whose parent is a/);
    expect(problems).toMatch(/more than one root/);
  });

  it('accepts parentless papers that are in the unplaced list', () => {
    const map = sample();
    map.set('draft', { id: 'draft', title: 'draft', description: '', content: '', parentId: null, childIds: [] });
    expect(checkTreeInvariants(map, ['draft'])).toEqual([]);
  });
});
