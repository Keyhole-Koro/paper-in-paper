import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildTestDoc as doc, fakeChannel, type FakePort } from '../../helpers/frames';

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
