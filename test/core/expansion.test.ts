import { describe, expect, it } from 'vitest';
import {
  closeAllChildren,
  closeChild,
  detachChild,
  expansionMapsEqual,
  getVisibleChildIds,
  isOpen,
  normalizeExpansionMap,
  openChild,
  pruneExpansionIds,
} from '../../src/lib/core/expansion';
import type { ExpansionMap } from '../../src/lib/core/types';
import { expansion, tree } from '../helpers/papers';

const papers = () => tree({ root: ['a', 'b'], a: ['a1'], a1: ['a1x'] });

describe('normalizeExpansionMap', () => {
  it('adds lookup sets, drops empty and malformed entries, de-duplicates and keeps unknown ids', () => {
    const raw = new Map<string, unknown>([
      ['root', { openChildIds: ['a', 'a', 'not-loaded-yet'] }],
      ['empty', { openChildIds: [] }],
      ['broken', { openChildIds: 'a' }],
      ['self', { openChildIds: ['self'] }],
      ['nulled', null],
    ]) as unknown as ExpansionMap;
    const map = normalizeExpansionMap(raw);
    expect([...map.keys()]).toEqual(['root']);
    expect(map.get('root')!.openChildIds).toEqual(['a', 'not-loaded-yet']);
    expect(map.get('root')!.openChildSet?.has('a')).toBe(true);
  });

  it('returns an empty map for missing input', () => {
    expect(normalizeExpansionMap(undefined).size).toBe(0);
    expect(normalizeExpansionMap(null).size).toBe(0);
  });

  it('rebuilds an entry whose lookup set disagrees with its ids', () => {
    const entry = { openChildIds: ['a', 'b'], openChildSet: new Set(['a', 'c']) };
    const map = normalizeExpansionMap(new Map([['root', entry]]));
    expect(map.get('root')).not.toBe(entry);
    expect([...map.get('root')!.openChildSet!].sort()).toEqual(['a', 'b']);
  });
});

describe('getVisibleChildIds', () => {
  it('keeps only open ids that are really children, in open order', () => {
    const map = papers();
    const open = expansion({ root: ['b', 'ghost', 'a1', 'a'] });
    expect(getVisibleChildIds(map, open, 'root')).toEqual(['b', 'a']);
  });

  it('ignores an entry that names an ancestor (which would otherwise loop)', () => {
    const map = papers();
    const open = expansion({ root: ['a'], a: ['a1', 'root'] });
    expect(getVisibleChildIds(map, open, 'a')).toEqual(['a1']);
  });
});

describe('openChild', () => {
  it('appends, inserts at a position, and leaves an open child alone without a position', () => {
    let map = openChild(new Map(), 'root', 'a');
    map = openChild(map, 'root', 'b');
    expect(map.get('root')!.openChildIds).toEqual(['a', 'b']);
    expect(openChild(map, 'root', 'a')).toBe(map);
    const moved = openChild(map, 'root', 'b', 'a');
    expect(moved.get('root')!.openChildIds).toEqual(['b', 'a']);
    expect(openChild(moved, 'root', 'b', 'a')).toBe(moved);
  });
});

describe('detachChild / closeChild', () => {
  it('detachChild keeps the child subtree state', () => {
    const map = expansion({ root: ['a', 'b'], a: ['a1'] });
    const next = detachChild(map, 'root', 'a');
    expect(next.get('root')!.openChildIds).toEqual(['b']);
    expect(next.get('a')!.openChildIds).toEqual(['a1']);
  });

  it('detachChild drops an entry that becomes empty and ignores closed children', () => {
    const map = expansion({ root: ['a'] });
    expect(detachChild(map, 'root', 'a').has('root')).toBe(false);
    expect(detachChild(map, 'root', 'b')).toBe(map);
  });

  it('closeChild forgets the open state below the closed child', () => {
    const map = expansion({ root: ['a', 'b'], a: ['a1'], a1: ['a1x'] });
    const next = closeChild(map, papers(), 'root', 'a');
    expect(next.get('root')!.openChildIds).toEqual(['b']);
    expect(next.has('a')).toBe(false);
    expect(next.has('a1')).toBe(false);
  });

  it('closeChild with nothing to do keeps the map identity', () => {
    const map = expansion({ root: ['a'] });
    expect(closeChild(map, papers(), 'root', 'b')).toBe(map);
  });

  it('closeAllChildren closes every open child', () => {
    const map = expansion({ root: ['a', 'b'], a: ['a1'] });
    const next = closeAllChildren(map, papers(), 'root');
    expect(next.size).toBe(0);
    expect(isOpen(next, 'root', 'a')).toBe(false);
  });
});

describe('pruneExpansionIds / expansionMapsEqual', () => {
  it('removes ids as parents and as children', () => {
    const map = expansion({ root: ['a', 'b'], a: ['a1'] });
    const next = pruneExpansionIds(map, new Set(['a']));
    expect([...next.keys()]).toEqual(['root']);
    expect(next.get('root')!.openChildIds).toEqual(['b']);
    expect(pruneExpansionIds(map, new Set())).toBe(map);
    expect(pruneExpansionIds(map, new Set(['zzz']))).toBe(map);
  });

  it('compares structurally and order-sensitively', () => {
    expect(expansionMapsEqual(expansion({ r: ['a', 'b'] }), expansion({ r: ['a', 'b'] }))).toBe(true);
    expect(expansionMapsEqual(expansion({ r: ['a', 'b'] }), expansion({ r: ['b', 'a'] }))).toBe(false);
    expect(expansionMapsEqual(expansion({ r: ['a'] }), expansion({ r: ['a'], s: ['b'] }))).toBe(false);
  });
});
