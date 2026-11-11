import { describe, expect, it } from 'vitest';
import { resolveColorContextOf } from '../../src/lib/react/internal/paperColors';
import { tree } from '../helpers/papers';

describe('resolveColorContextOf', () => {
  it('takes the nearest hue up the chain and deepens it once per level', () => {
    const map = tree({ root: ['a'], a: ['a1'], a1: ['a2'] }, { a: { hue: 30 } });
    expect(resolveColorContextOf(map, 'a')).toEqual({ hue: 30, depth: 0, saturationScale: undefined });
    expect(resolveColorContextOf(map, 'a2')).toEqual({ hue: 30, depth: 2, saturationScale: undefined });
    // Above any hue: the default hue, counted from the root.
    expect(resolveColorContextOf(map, 'root')).toEqual({ hue: 220, depth: 0, saturationScale: undefined });
  });

  it('inherits the nearest saturation scale unless a paper sets its own', () => {
    const map = tree({ root: ['a'], a: ['a1'], a1: ['a2'] }, { a: { hue: 30, saturationScale: 0 }, a2: { saturationScale: 0.5 } });
    expect(resolveColorContextOf(map, 'a1').saturationScale).toBe(0);
    expect(resolveColorContextOf(map, 'a2').saturationScale).toBe(0.5);
  });

  it('survives a parent cycle and a missing paper', () => {
    const map = tree({ root: ['a'], a: ['b'] }, { a: { hue: 90 } });
    map.set('a', { ...map.get('a')!, parentId: 'b' });
    expect(resolveColorContextOf(map, 'b').hue).toBe(90);
    expect(resolveColorContextOf(map, 'nope')).toEqual({ hue: 220, depth: 0, saturationScale: undefined });
  });
});
