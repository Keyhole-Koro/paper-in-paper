import { describe, expect, it } from 'vitest';
import {
  appendRelatedLinks,
  escapeHtml,
  findImageMarkerIds,
  findLinkedPaperIds,
  safeExternalHref,
  stripHttpEquiv,
} from '../../../src/lib/react/internal/frame/contentHtml';
import { buildTestDoc } from '../../helpers/frames';

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

/** How many `meta[http-equiv]` elements a browser builds from a document. */
const countHttpEquiv = (document: string) =>
  new DOMParser().parseFromString(document, 'text/html').querySelectorAll('meta[http-equiv]').length;
/** The same for content as it is, in a document that ends like a frame's. */
const rawHttpEquiv = (html: string) => countHttpEquiv(`<!DOCTYPE html><html><head></head><body>\n${html}\n</body>\n</html>`);
/** The same for content in a real frame document, minus the canvas's own policy. */
const frameHttpEquiv = (html: string) => countHttpEquiv(buildTestDoc({ html })) - 1;

describe('stripHttpEquiv against the HTML tokenizer', () => {
  const refresh = 'content="0;url=https://evil.test/"';
  const tricky = [
    // A quote inside an attribute name does not start a quoted value.
    `<meta foo"bar http-equiv=refresh ${refresh}>`,
    `<meta a='b"c' x"y http-equiv="refresh" ${refresh}>`,
    `<meta foo=bar"baz http-equiv=refresh ${refresh}>`,
    `<meta =" http-equiv=refresh ${refresh}>`,
    // A comment-looking or attribute-looking `<meta` before the real one.
    `<!-- <meta x=" --><meta http-equiv=refresh ${refresh}>" -->`,
    `<a title="<meta "><meta http-equiv=refresh ${refresh}>`,
    // Case, separators and unclosed tags (they close on the markup after the content).
    `<MeTa HtTp-EqUiV=refresh ${refresh}>`,
    `<meta/http-equiv/=refresh/${refresh}>`,
    `<meta\thttp-equiv\f=\rrefresh ${refresh}>`,
    `<meta http-equiv=refresh ${refresh}`,
    `<meta ${refresh} http-equiv=refresh`,
    `<svg><meta http-equiv=refresh ${refresh}></svg>`,
  ];

  it.each(tricky)('leaves no meta[http-equiv] in %j', (tag) => {
    const html = `<p>before</p>${tag}<p>after</p>`;
    expect(rawHttpEquiv(html)).toBeGreaterThan(0);
    expect(rawHttpEquiv(stripHttpEquiv(html))).toBe(0);
    expect(frameHttpEquiv(html)).toBe(0);
  });

  // Removing the inner tag joins the outer text into a new one.
  it.each([
    `<me<meta http-equiv>ta http-equiv=refresh ${refresh}>`,
    `<me<meta http-equiv="x"><meta http-equiv="y">ta http-equiv=refresh ${refresh}>`,
    `<m<me<meta http-equiv>ta http-equiv>eta http-equiv=refresh ${refresh}>`,
    `<me<META/HTTP-EQUIV>ta http-equiv=refresh ${refresh}>`,
  ])('leaves no meta[http-equiv] once removals join the text around them: %j', (tag) => {
    const html = `<p>before</p>${tag}<p>after</p>`;
    expect(rawHttpEquiv(stripHttpEquiv(html))).toBe(0);
    expect(frameHttpEquiv(html)).toBe(0);
  });

  it('removes the bypasses that got past the old pattern', () => {
    expect(stripHttpEquiv(`<p>a</p><meta foo"bar http-equiv=refresh ${refresh}><p>b</p>`)).toBe('<p>a</p><p>b</p>');
    expect(stripHttpEquiv(`<p>a</p><me<meta http-equiv>ta http-equiv=refresh ${refresh}><p>b</p>`)).toBe('<p>a</p><p>b</p>');
  });

  it('keeps meta elements without http-equiv, and names that only contain it', () => {
    const html = '<meta charset="utf-8"><meta name="http-equiv" content="x"><meta data-http-equiv="x"><meta http-equivx="x"><meta-x http-equiv="x"></meta-x>';
    expect(stripHttpEquiv(html)).toBe(html);
  });

  it('finds no meta[http-equiv] in generated tag soup', () => {
    const pieces = ['<', '<meta', '<META', '<me', 'ta', 'eta', ' ', '\n', '/', '>', '=', '"', "'", 'http-equiv',
      'HTTP-EQUIV', 'refresh', refresh, 'foo"bar', '<!--', '-->', 'x', '<svg>', '<p>', '`'];
    // A fixed-seed generator, so a failure always reproduces.
    let seed = 20261120;
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 1500; round += 1) {
      let html = '';
      const length = 1 + next(14);
      for (let i = 0; i < length; i += 1) html += pieces[next(pieces.length)];
      const stripped = stripHttpEquiv(html);
      expect(rawHttpEquiv(stripped), JSON.stringify(html)).toBe(0);
    }
  });

  it('escapes every <meta in text too costly to check, leaving no meta element', () => {
    // Every `<meta` here runs to the end of the text, so checking each one is quadratic.
    const unclosed = `${'<meta '.repeat(40000)}<p>text`;
    const stripped = stripHttpEquiv(unclosed);
    expect(stripped).not.toMatch(/<meta/i);
    expect(stripped).toBe(`${'&lt;meta '.repeat(40000)}<p>text`);

    const depth = 5000;
    const nested = `${'<me'.repeat(depth)}<meta http-equiv>${'ta http-equiv=refresh>'.repeat(depth)}`;
    // Each removal joins one more level: thousands of passes would be needed.
    expect(stripHttpEquiv(nested)).not.toMatch(/<meta/i);
    expect(rawHttpEquiv(stripHttpEquiv(nested))).toBe(0);
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
