import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  estimateContentMass,
  estimateHtmlMass,
  getContentDemandFactor,
  isContentNode,
  REFERENCE_CONTENT_MASS,
} from '../../src/lib/core/contentMass';
import type { Paper } from '../../src/lib/core/types';
import { config, makeConfig } from '../helpers/papers';

const paper = (content: Paper['content']): Paper => ({ id: 'p', title: 'p', description: '', content, parentId: null, childIds: [] });

describe('estimateHtmlMass', () => {
  it('counts visible text, not markup, scripts or styles', () => {
    expect(estimateHtmlMass('<p class="x">hello</p>')).toBe(5);
    expect(estimateHtmlMass('<style>p{color:red}</style><script>var a=1</script><p>hi</p>')).toBe(2);
  });

  it('counts full-width characters double and adds media and table rows', () => {
    expect(estimateHtmlMass('<p>日本語</p>')).toBe(6);
    expect(estimateHtmlMass('<img src="x">')).toBe(400);
    expect(estimateHtmlMass('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>')).toBe(2 + 80);
  });
});

describe('estimateContentMass', () => {
  it('walks structured content', () => {
    expect(estimateContentMass([
      { type: 'paragraph', children: [{ type: 'text', value: 'abc' }, { type: 'bold', children: [{ type: 'text', value: 'de' }] }] },
      { type: 'paper-link', paperId: 'x', label: 'link' },
      { type: 'list', items: [[{ type: 'text', value: 'li' }]] },
      { type: 'table', headers: ['h'], rows: [['c']] },
      { type: 'card', paperId: 'x', title: 't', description: 'dd' },
      { type: 'section', title: 's', children: [{ type: 'callout', children: [{ type: 'text', value: 'z' }] }] },
    ])).toBe(3 + 2 + 4 + 2 + (1 + 40 + 1) + (80 + 1 + 2) + (1 + 1));
  });

  it('treats React content as reference mass and nothing as zero', () => {
    expect(estimateContentMass(createElement('div', null, 'x'))).toBe(REFERENCE_CONTENT_MASS);
    expect(estimateContentMass([createElement('div', { key: 1 })])).toBe(REFERENCE_CONTENT_MASS);
    expect(estimateContentMass(null)).toBe(0);
    expect(isContentNode(createElement('div'))).toBe(false);
  });
});

describe('getContentDemandFactor', () => {
  it('grows with the square root of mass within [0.6, 2.2]', () => {
    expect(getContentDemandFactor(paper('<p>hi</p>'), config)).toBe(0.6);
    expect(getContentDemandFactor(paper('x'.repeat(REFERENCE_CONTENT_MASS)), config)).toBeCloseTo(1);
    expect(getContentDemandFactor(paper('x'.repeat(REFERENCE_CONTENT_MASS * 4)), config)).toBeCloseTo(2);
    expect(getContentDemandFactor(paper('x'.repeat(REFERENCE_CONTENT_MASS * 100)), config)).toBe(2.2);
  });

  it('is 1 for every paper in uniform mode', () => {
    expect(getContentDemandFactor(paper('x'.repeat(10_000)), makeConfig({ layout: { contentDemand: 'uniform' } }))).toBe(1);
  });
});
