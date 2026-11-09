import { describe, expect, it } from 'vitest';
import { PaperMapBuilder } from '../../src/lib/core/paperMapBuilder';
import { checkTreeInvariants } from '../../src/lib/core/tree';
import { paperCanvasConfigKey, resolvePaperCanvasConfig, defaultPaperCanvasConfig } from '../../src/lib/config/paperCanvasConfig';

describe('PaperMapBuilder', () => {
  it('resolves parents from children in any upsert order', () => {
    const builder = new PaperMapBuilder()
      .upsert({ id: 'child', title: 'Child', content: 'c' })
      .upsert({ id: 'root', title: 'Root', content: 'r', children: ['child', { id: 'other' }] })
      .upsert({ id: 'other', title: 'Other', content: 'o' })
      .build();
    expect(builder.get('child')!.parentId).toBe('root');
    expect(builder.get('other')!.parentId).toBe('root');
    expect(builder.get('root')!.childIds).toEqual(['child', 'other']);
    expect(builder.get('child')!.description).toBe('');
    expect(checkTreeInvariants(builder)).toEqual([]);
  });

  it('passes every optional paper field through', () => {
    const layout = () => ({ contentShare: 1, childShares: {} });
    const map = new PaperMapBuilder()
      .upsert({ id: 'p', title: 'P', content: '', importance: 2, contentImportance: 50, minWidth: 300, minHeight: 200, childMinShares: { x: 0.2 }, layout, hue: 10 })
      .build();
    expect(map.get('p')).toMatchObject({ importance: 2, contentImportance: 50, minWidth: 300, minHeight: 200, childMinShares: { x: 0.2 }, layout, hue: 10 });
  });

  it('replaces papers instead of mutating ones handed out before', () => {
    const builder = new PaperMapBuilder().upsert({ id: 'a', title: 'A', content: '' });
    const before = builder.get('a')!;
    builder.upsert({ id: 'root', title: 'R', content: '', children: ['a'] }).build();
    expect(before.parentId).toBeNull();
    expect(builder.get('a')!.parentId).toBe('root');
  });
});

describe('config', () => {
  it('merges partial input over the defaults', () => {
    const resolved = resolvePaperCanvasConfig({ attention: { openBonus: 1 }, layout: { minPaperWidth: 10 } });
    expect(resolved.attention.openBonus).toBe(1);
    expect(resolved.attention.focusBonus).toBe(defaultPaperCanvasConfig.attention.focusBonus);
    expect(resolved.layout.minPaperWidth).toBe(10);
    expect(resolved.content.fontSize).toBe(defaultPaperCanvasConfig.content.fontSize);
  });

  it('keys config input by value', () => {
    expect(paperCanvasConfigKey({ layout: { minPaperWidth: 1 } })).toBe(paperCanvasConfigKey({ layout: { minPaperWidth: 1 } }));
    expect(paperCanvasConfigKey(undefined)).toBe('');
  });
});
