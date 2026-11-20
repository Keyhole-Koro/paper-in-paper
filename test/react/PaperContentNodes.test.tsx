import { cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentNode } from '../../src/lib/core/types';
import { buildPaperMap } from '../../src/lib/core/tree';
import { expansion } from '../helpers/papers';
import { renderCanvas } from '../helpers/render';

afterEach(cleanup);

/**
 * Text from papers is data: markup in any field must come out as text, never as elements.
 * These guard against a future raw-HTML path (dangerouslySetInnerHTML, unescaped srcdoc).
 */
const IMG = '<img src=x onerror="window.__pipXss = 1">';
const SCRIPT = '<script>window.__pipXss = 2</script>';
const payload = (field: string) => `${field} ${IMG} ${SCRIPT}`;

const frame = (id: string) => document.querySelector<HTMLElement>(`[data-paper-id-frame="${id}"]`)!;
const header = (id: string) => frame(id).firstElementChild as HTMLElement;

function expectNoMarkup(root: ParentNode) {
  expect(root.querySelectorAll('img, script')).toHaveLength(0);
  expect((window as { __pipXss?: number }).__pipXss).toBeUndefined();
}

describe('untrusted text in papers', () => {
  it('renders every ContentNode text field as text', async () => {
    const nodes: ContentNode[] = [
      { type: 'paragraph', children: [
        { type: 'text', value: payload('text') },
        { type: 'bold', children: [{ type: 'text', value: payload('bold') }] },
        { type: 'paper-link', paperId: 'a', label: payload('label') },
      ] },
      { type: 'card', paperId: 'a', title: payload('card title'), description: payload('card description') },
      { type: 'section', title: payload('section title'), children: [{ type: 'text', value: 'section body' }] },
      { type: 'list', items: [[{ type: 'text', value: payload('list item') }]] },
      { type: 'table', headers: [payload('header')], rows: [[payload('cell')]] },
      { type: 'callout', children: [{ type: 'text', value: payload('callout') }] },
    ];
    await renderCanvas({ paperMap: buildPaperMap([
      { id: 'root', title: 'Root', description: '', content: nodes, parentId: null, childIds: ['a'] },
      { id: 'a', title: 'A', description: '', content: '', parentId: 'root', childIds: [] },
    ]) });

    const room = frame('root');
    expectNoMarkup(room);
    for (const field of ['text', 'bold', 'label', 'card title', 'card description', 'section title', 'list item', 'header', 'cell', 'callout']) {
      expect(within(room).getByText(payload(field))).toBeTruthy();
    }
    expect(room.querySelector('th')!.textContent).toBe(payload('header'));
    expect(room.querySelector('td')!.textContent).toBe(payload('cell'));
    expect(room.querySelector('h2')!.textContent).toBe(payload('section title'));
  });

  it('renders paper titles as text in headers, frame titles and related links', async () => {
    await renderCanvas({
      paperMap: buildPaperMap([
        { id: 'root', title: payload('root title'), description: '', content: '<p>root body</p>', parentId: null, childIds: ['a'] },
        { id: 'a', title: payload('child title'), description: '', content: [{ type: 'text', value: 'a body' }], parentId: 'root', childIds: [] },
      ]),
      defaultOpenState: { expansionMap: expansion({ root: ['a'] }) },
    });

    expectNoMarkup(document);
    expect(within(header('root')).getByText(payload('root title'))).toBeTruthy();
    expect(within(header('a')).getByText(payload('child title'))).toBeTruthy();

    const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-paper-content-id="root"]')!;
    expect(iframe.getAttribute('title')).toBe(payload('root title'));
    // The frame document: the related link to the child carries its title as text.
    const doc = new DOMParser().parseFromString(iframe.getAttribute('srcdoc')!, 'text/html');
    expect(doc.body.querySelectorAll('img, script')).toHaveLength(0);
    expect(doc.body.querySelector('a[data-paper-id="a"]')!.textContent).toBe(payload('child title'));
  });
});
