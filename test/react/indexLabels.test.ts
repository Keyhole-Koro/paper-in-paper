import { describe, expect, it } from 'vitest';
import { computeCanvasLayout } from '../../src/lib/core/layout';
import {
  buildIndexLabels,
  getIndexLabelExtent,
  getIndexLabelFontSize,
  stabilizeIndexLabels,
  TAB_MAX_LEN,
  TAB_MIN_LEN,
} from '../../src/lib/react/internal/indexLabels';
import { config, open, run, stateOf, tree } from '../helpers/papers';

describe('index labels', () => {
  it('packs labels along the edge without overlapping, even when they do not fit', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    let state = run(stateOf(tree({ root: ids }, { root: { hue: 40 } })), ids.map((id) => open('root', id)));
    state = run(state, ids.map((id) => ({ type: 'INDEX_CONTENT' as const, nodeId: id })));
    for (const height of [2000, 600, 300]) {
      const layout = computeCanvasLayout(state, config, 'root', { width: 800, height });
      const labels = buildIndexLabels(layout, state.paperMap);
      expect(labels).toHaveLength(12);
      const sorted = [...labels].sort((a, b) => a.centerY - b.centerY);
      for (let i = 1; i < sorted.length; i += 1) {
        expect(sorted[i].centerY - sorted[i].extent / 2).toBeGreaterThanOrEqual(sorted[i - 1].centerY + sorted[i - 1].extent / 2 - 1e-6);
      }
      for (const label of labels) {
        expect(label.centerY - label.extent / 2).toBeGreaterThanOrEqual(-1e-6);
        expect(label.centerY + label.extent / 2).toBeLessThanOrEqual(height + 1e-6);
        expect(label.color.hue).toBe(40);
      }
    }
  });

  it('sizes tabs by title, counting full-width characters double, with a readable minimum font', () => {
    expect(getIndexLabelExtent('short')).toBe(TAB_MIN_LEN);
    expect(getIndexLabelExtent('a much longer english title')).toBeGreaterThan(TAB_MIN_LEN);
    expect(getIndexLabelExtent('とても長い日本語のタイトルです')).toBe(TAB_MAX_LEN);
    expect(getIndexLabelFontSize('x'.repeat(80))).toBeGreaterThanOrEqual(9);
  });

  it('keeps the previous array while labels are unchanged', () => {
    const state = run(stateOf(tree({ root: ['a', 'b'] })), [open('root', 'a'), open('root', 'b'), { type: 'INDEX_CONTENT', nodeId: 'a' }]);
    const layout = computeCanvasLayout(state, config, 'root', { width: 800, height: 600 });
    const first = buildIndexLabels(layout, state.paperMap);
    expect(stabilizeIndexLabels(first, buildIndexLabels(layout, state.paperMap))).toBe(first);
    const renamed = new Map(state.paperMap).set('a', { ...state.paperMap.get('a')!, title: 'renamed' });
    expect(stabilizeIndexLabels(first, buildIndexLabels(layout, renamed))).not.toBe(first);
  });
});
