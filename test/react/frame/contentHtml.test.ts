import { describe, expect, it } from 'vitest';
import {
  appendRelatedLinks,
  escapeHtml,
  findImageMarkerIds,
  findLinkedPaperIds,
  safeExternalHref,
  stripHttpEquiv,
} from '../../../src/lib/react/internal/frame/contentHtml';

describe('stripHttpEquiv', () => {
  it.each([
    '<meta http-equiv="refresh" content="0;url=https://evil.test/">',
    '<META HTTP-EQUIV=refresh CONTENT=0;url=https://evil.test/>',
    "<meta content='0;url=https://evil.test/?a>b' http-equiv='refresh'>",
    '<meta\nhttp-equiv="refresh"\ncontent="0">',
    '<meta/http-equiv=refresh content=0>',
    '<meta http-equiv="Content-Security-Policy" content="default-src *">',
  ])('removes %s', (tag) => {
    expect(stripHttpEquiv(`<p>a</p>${tag}<p>b</p>`)).toBe('<p>a</p><p>b</p>');
  });

  it('keeps other meta elements and text that only mentions http-equiv', () => {
    const html = '<meta name="description" content="about http-equiv"><p>http-equiv is a pragma</p>';
    expect(stripHttpEquiv(html)).toBe(html);
  });
});

describe('related links', () => {
  it('appends children the content does not link to, escaping titles and ids', () => {
    const html = appendRelatedLinks('<p><a data-paper-id="a">a</a></p>', [
      { id: 'a', title: 'A' },
      { id: 'b"x', title: '<img src=x onerror=alert(1)>' },
    ], 'Related & more');
    expect(html).toContain('data-paper-id="b&quot;x"');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('Related &amp; more');
    expect(html.match(/data-paper-id="a"/g)).toHaveLength(1);
  });

  it('recognises links written with single quotes or no quotes, and adds nothing when all are linked', () => {
    const html = `<a data-paper-id='a'>a</a><a data-paper-id=b>b</a>`;
    expect(findLinkedPaperIds(html)).toEqual(new Set(['a', 'b']));
    expect(appendRelatedLinks(html, [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], 'Related')).toBe(html);
  });

  it('finds image markers', () => {
    expect(findImageMarkerIds('<img data-file-id="f1"><img data-file-id=\'f&amp;2\'>')).toEqual(new Set(['f1', 'f&2']));
  });

  it('escapeHtml escapes the five characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('external links', () => {
  it('only lets http(s) and mailto links out', () => {
    expect(safeExternalHref('https://example.com/a?b')).toBe('https://example.com/a?b');
    expect(safeExternalHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeExternalHref('javascript:alert(1)')).toBeNull();
    expect(safeExternalHref('data:text/html,x')).toBeNull();
    expect(safeExternalHref('about:srcdoc#x')).toBeNull();
    expect(safeExternalHref('not a url')).toBeNull();
  });
});
