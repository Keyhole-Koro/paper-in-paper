import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  appendRelatedLinks,
  buildSrcDoc,
  contentSecurityPolicy,
  createFrameToken,
  escapeHtml,
  findImageMarkerIds,
  findLinkedPaperIds,
  isFrameHello,
  isPaperContentEvent,
  safeExternalHref,
  stripHttpEquiv,
  type IframeTheme,
} from '../../src/lib/react/internal/iframeBridge';
import { fakeChannel, type FakePort } from '../helpers/frames';

const theme: IframeTheme = {
  surface: '#fff', surfaceAlt: '#eee', surfaceRaised: '#ddd', text: '#111', mutedText: '#666',
  divider: '#ccc', linkBackground: '#f0f0f0', linkBackgroundHover: '#e0e0e0', linkBorder: '#bbb', linkText: '#222',
};

const doc = (options: Partial<Parameters<typeof buildSrcDoc>[0]> = {}) =>
  buildSrcDoc({ html: '<p>hello</p>', theme, fontSize: 14, nonce: 'NONCE', secret: 'SECRET1', ...options });

describe('content security policy', () => {
  const policy = contentSecurityPolicy('abc');
  const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));

  it('runs only the nonce-bearing bootstrap', () => {
    expect(directive('script-src')).toBe("script-src 'nonce-abc'");
    expect(policy).not.toContain('unsafe-eval');
  });

  it('allows no requests a stylesheet or script could chain', () => {
    expect(directive('default-src')).toBe("default-src 'none'");
    expect(directive('style-src')).toBe("style-src 'unsafe-inline'");
    expect(directive('font-src')).toBe('font-src data:');
    expect(directive('connect-src')).toBe("connect-src 'none'");
    expect(directive('form-action')).toBe("form-action 'none'");
    expect(directive('base-uri')).toBe("base-uri 'none'");
    expect(directive('frame-src')).toBe("frame-src 'none'");
  });
});

describe('buildSrcDoc', () => {
  it('puts the policy and the bootstrap (with its nonce and secret) in the head, before any content', () => {
    const built = doc();
    const [head, body] = built.split('<body>');
    expect(head).toContain(`<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy('NONCE')}" />`);
    expect(head).toContain('<script nonce="NONCE">');
    expect(head).toContain("var SECRET = 'SECRET1'");
    expect(head.indexOf('Content-Security-Policy')).toBeLessThan(head.indexOf('<script'));
    expect(head).toContain('<meta name="referrer" content="no-referrer" />');
    expect(body).toContain('<p>hello</p>');
    expect(built).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('never lets a secret break out of its string', () => {
    expect(doc({ secret: "x';alert(1);'" })).toContain("var SECRET = 'xalert1'");
  });

  it('applies the font size and colour scheme', () => {
    expect(doc({ fontSize: 15 })).toContain('font-size: 15px');
    expect(doc({ colorScheme: 'dark' })).toContain('color-scheme: dark');
  });

  it('keeps override CSS inside its style element and lets baseCss replace the built-in styles', () => {
    expect(doc({ overrideCss: 'p{}</style><script>alert(1)</script>' })).not.toContain('</style><script>alert(1)');
    const custom = doc({ baseCss: 'body { color: red; }' });
    expect(custom).toContain('body { color: red; }');
    expect(custom).not.toContain('a[data-paper-id] {');
    expect(custom).toContain('display: flow-root');
  });

  it('removes http-equiv pragmas from the content', () => {
    const built = doc({ html: '<meta http-equiv="refresh" content="0;url=https://evil.test/"><p>x</p>' });
    expect(built.split('<body>')[1]).not.toMatch(/http-equiv/i);
  });
});

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

describe('createFrameToken', () => {
  it('makes URL-safe random tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createFrameToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
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

describe('messages from frames', () => {
  it('accepts the known events and rejects malformed ones', () => {
    for (const good of [
      { type: 'open', paperId: 'a' },
      { type: 'dragstart', paperId: 'a', clientX: 1, clientY: 2 },
      { type: 'dragmove', clientX: 1, clientY: 2 },
      { type: 'dragend', clientX: 1, clientY: 2 },
      { type: 'dragcancel' },
      { type: 'resize', height: 10 },
      { type: 'loadImage', fileId: 'f' },
      { type: 'openExternal', href: 'https://x' },
      { type: 'pong', seq: 3 },
      { type: 'leaving' },
    ]) {
      expect(isPaperContentEvent(good)).toBe(true);
    }
    for (const bad of [null, 1, 'open', {}, { type: 'open' }, { type: 'resize', height: -1 }, { type: 'resize', height: Number.NaN },
      { type: 'dragstart', paperId: 'a' }, { type: 'dragmove', clientX: 1 }, { type: 'dragend', clientX: 'x', clientY: 1 },
      { type: 'loadImage' }, { type: 'pong' }, { type: 'nope' }]) {
      expect(isPaperContentEvent(bad)).toBe(false);
    }
  });

  it('recognises the hello', () => {
    expect(isFrameHello({ type: 'pip:hello', secret: 's' })).toBe(true);
    expect(isFrameHello({ type: 'pip:hello' })).toBe(false);
    expect(isFrameHello({ type: 'open', secret: 's' })).toBe(false);
    expect(isFrameHello(null)).toBe(false);
  });

  it('only lets http(s) and mailto links out', () => {
    expect(safeExternalHref('https://example.com/a?b')).toBe('https://example.com/a?b');
    expect(safeExternalHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeExternalHref('javascript:alert(1)')).toBeNull();
    expect(safeExternalHref('data:text/html,x')).toBeNull();
    expect(safeExternalHref('about:srcdoc#x')).toBeNull();
    expect(safeExternalHref('not a url')).toBeNull();
  });
});

/**
 * The bootstrap itself, run in its own jsdom with scripts on. jsdom has no MessageChannel, so
 * the frame gets the fake one; it is its own parent, so its postMessage is the parent's.
 */
function runFrame(content: string, { url = 'https://canvas.test/page' } = {}) {
  const hellos: Array<{ data: unknown; port: FakePort }> = [];
  const dom = new JSDOM(doc({ html: content }), {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      class Channel {
        port1: FakePort;
        port2: FakePort;
        constructor() {
          [this.port1, this.port2] = fakeChannel();
        }
      }
      Object.assign(window, { MessageChannel: Channel });
      window.postMessage = ((data: unknown, _origin: string, transfer?: FakePort[]) => {
        hellos.push({ data, port: transfer![0] });
      }) as typeof window.postMessage;
    },
  });
  const { window } = dom;
  expect(hellos).toHaveLength(1);
  const events: Array<Record<string, unknown>> = [];
  hellos[0].port.onmessage = ({ data }) => events.push(data as Record<string, unknown>);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
  const pointer = (type: string, target: Element, x: number, y: number, extra: Record<string, unknown> = {}) =>
    target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...extra }));
  return { window, document: window.document, hello: hellos[0], events, settle, pointer, close: () => window.close() };
}

describe('the bootstrap', () => {
  it('says hello with its secret and a port, then reports its height', async () => {
    const frame = runFrame('<p>x</p>');
    expect(frame.hello.data).toEqual({ type: 'pip:hello', secret: 'SECRET1' });
    await frame.settle();
    expect(frame.events).toContainEqual({ type: 'resize', height: 0 });
    frame.close();
  });

  it('says it is leaving when the document goes', async () => {
    const frame = runFrame('<p>x</p>');
    frame.window.dispatchEvent(new frame.window.Event('pagehide'));
    await frame.settle();
    expect(frame.events).toContainEqual({ type: 'leaving' });
    frame.close();
  });

  it('answers pings on its port', async () => {
    const frame = runFrame('<p>x</p>');
    frame.hello.port.postMessage({ type: 'ping', seq: 7 });
    await frame.settle();
    expect(frame.events).toContainEqual({ type: 'pong', seq: 7 });
    frame.close();
  });

  // jsdom does not implement DOM clobbering; e2e/harness.spec.ts checks that in a browser.
  it('follows paper links from nested elements and from forms with clobbering inputs', async () => {
    const frame = runFrame(`
      <img name="addEventListener"><img name="documentElement"><img name="querySelectorAll">
      <form name="baseURI"></form>
      <form data-paper-id="f"><input name="closest"><input name="getAttribute"><button id="inner">x</button></form>
      <a data-paper-id="child" id="link"><span id="label">Child</span></a>`);
    frame.document.getElementById('label')!.dispatchEvent(new frame.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    frame.document.getElementById('inner')!.dispatchEvent(new frame.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await frame.settle();
    expect(frame.events).toContainEqual({ type: 'open', paperId: 'child' });
    expect(frame.events).toContainEqual({ type: 'open', paperId: 'f' });
    // Keyboard users get a focusable link.
    expect(frame.document.getElementById('link')!.getAttribute('tabindex')).toBe('0');
    expect(frame.document.getElementById('link')!.getAttribute('role')).toBe('link');
    frame.close();
  });

  it('keeps regular links, image maps and forms from navigating the frame, and hands links out', async () => {
    const frame = runFrame(`
      <a id="out" href="/docs?q=1">docs</a><a id="hash" href="#top">top</a>
      <map name="m"><area id="area" href="https://area.test/" alt="a"></map>
      <form id="form" action="https://evil.test/"><button>go</button></form>`);
    const click = (id: string) => {
      const event = new frame.window.MouseEvent('click', { bubbles: true, cancelable: true });
      frame.document.getElementById(id)!.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(click('out')).toBe(true);
    expect(click('area')).toBe(true);
    expect(click('hash')).toBe(false);
    const submit = new frame.window.Event('submit', { bubbles: true, cancelable: true });
    frame.document.getElementById('form')!.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    await frame.settle();
    // Relative links resolve against the document's base URL.
    expect(frame.events).toContainEqual({ type: 'openExternal', href: 'https://canvas.test/docs?q=1' });
    expect(frame.events).toContainEqual({ type: 'openExternal', href: 'https://area.test/' });
    expect(frame.events.filter((e) => e.type === 'openExternal')).toHaveLength(2);
    frame.close();
  });

  it('blocks native drag and drop, which would navigate the frame or steal the pointer', () => {
    const frame = runFrame('<a id="out" href="https://x.test/">x</a>');
    for (const type of ['dragstart', 'dragover', 'drop']) {
      const event = new frame.window.Event(type, { bubbles: true, cancelable: true });
      frame.document.getElementById('out')!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    frame.close();
  });

  it('forwards a link drag: start past the threshold, moves, the release, and no click afterwards', async () => {
    const frame = runFrame('<a data-paper-id="child" id="link">Child</a>');
    const link = frame.document.getElementById('link')!;
    frame.pointer('pointerdown', link, 10, 10);
    frame.pointer('pointermove', link, 12, 11);
    await frame.settle();
    expect(frame.events.some((e) => e.type === 'dragstart')).toBe(false);
    frame.pointer('pointermove', link, 30, 10);
    frame.pointer('pointermove', frame.document.body, 60, 40);
    await frame.settle();
    frame.pointer('pointerup', frame.document.body, 70, 45);
    link.dispatchEvent(new frame.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await frame.settle();
    const drag = frame.events.filter((e) => String(e.type).startsWith('drag'));
    expect(drag[0]).toEqual({ type: 'dragstart', paperId: 'child', clientX: 30, clientY: 10 });
    expect(drag).toContainEqual({ type: 'dragmove', clientX: 60, clientY: 40 });
    expect(drag.at(-1)).toEqual({ type: 'dragend', clientX: 70, clientY: 45 });
    // The click that ends a drag does not also open the link.
    expect(frame.events.some((e) => e.type === 'open')).toBe(false);
    frame.close();
  });

  it('cancels a link drag on Escape or pointercancel', async () => {
    const frame = runFrame('<a data-paper-id="child" id="link">Child</a>');
    const link = frame.document.getElementById('link')!;
    frame.pointer('pointerdown', link, 10, 10);
    frame.pointer('pointermove', link, 40, 10);
    const escape = new frame.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    frame.document.body.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    frame.pointer('pointerdown', link, 10, 10);
    frame.pointer('pointermove', link, 40, 10);
    frame.pointer('pointercancel', link, 40, 10);
    await frame.settle();
    expect(frame.events.filter((e) => e.type === 'dragcancel')).toHaveLength(2);
    expect(frame.events.some((e) => e.type === 'dragend')).toBe(false);
    frame.close();
  });

  it('marks open links, and sets image sources only to safe URLs', async () => {
    const frame = runFrame('<a data-paper-id="a" id="a">A</a><a data-paper-id="b" id="b">B</a><img id="img" data-file-id="f1">');
    await frame.settle();
    expect(frame.events).toContainEqual({ type: 'loadImage', fileId: 'f1' });
    frame.hello.port.postMessage({ type: 'setOpenIds', openIds: ['b'] });
    frame.hello.port.postMessage({ type: 'setImageUrl', fileId: 'f1', url: 'javascript:alert(1)' });
    await frame.settle();
    expect(frame.document.getElementById('a')!.hasAttribute('data-open')).toBe(false);
    expect(frame.document.getElementById('b')!.hasAttribute('data-open')).toBe(true);
    expect(frame.document.getElementById('img')!.getAttribute('src')).toBeNull();
    frame.hello.port.postMessage({ type: 'setImageUrl', fileId: 'f1', url: 'https://cdn.test/f1.png' });
    await frame.settle();
    expect(frame.document.getElementById('img')!.getAttribute('src')).toBe('https://cdn.test/f1.png');
    frame.close();
  });
});
