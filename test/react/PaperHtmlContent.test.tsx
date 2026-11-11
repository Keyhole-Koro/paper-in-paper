import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Paper } from '../../src/lib/core/types';
import { buildPaperMap } from '../../src/lib/core/tree';
import { PaperHtmlContent } from '../../src/lib/react/components/PaperHtmlContent';
import { FRAME_CHECK_MS } from '../../src/lib/react/internal/frame/connection';
import { connectFrame, fakeChannel, loadFrame, nonceOf, sayHello, secretOf } from '../helpers/frames';
import { expansion } from '../helpers/papers';
import { installRafQueue, renderCanvas, roomBox } from '../helpers/render';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const html = `<h1>Report</h1>
<p><a data-paper-id="child">child link</a> <a data-paper-id="root">up</a> <a data-paper-id="cousin">cousin</a></p>
<img data-file-id="file-1"><script>window.evil = 1</script>`;

function papers(rootContent: Paper['content'] = html): Map<string, Paper> {
  return buildPaperMap([
    { id: 'root', title: 'Root', description: '', content: rootContent, parentId: null, childIds: ['child', 'quiet', 'other'] },
    { id: 'child', title: 'Child', description: '', content: '<p>child</p>', parentId: 'root', childIds: [] },
    { id: 'quiet', title: 'Quiet <b>child</b>', description: '', content: '<p>quiet</p>', parentId: 'root', childIds: [] },
    { id: 'other', title: 'Other', description: '', content: '<p>other</p>', parentId: 'root', childIds: ['cousin'] },
    { id: 'cousin', title: 'Cousin', description: '', content: '<p>cousin</p>', parentId: 'other', childIds: [] },
  ]);
}

const frameOf = (id: string) => document.querySelector<HTMLIFrameElement>(`iframe[data-paper-content-id="${id}"]`)!;
const ghost = (title: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[aria-hidden="true"]')).find((el) => el.textContent === title);
const openIn = (view: Awaited<ReturnType<typeof renderCanvas>>, id: string) =>
  view.handle.current!.getState().expansionMap.get(id)?.openChildIds ?? [];

/** jsdom fires one load event for every new iframe; let it pass before counting loads. */
async function settleFrames() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function placeFrame(frame: HTMLIFrameElement, left: number, top: number) {
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(
    { left, top, right: left + 500, bottom: top + 350, width: 500, height: 350, x: left, y: top, toJSON() {} } as DOMRect,
  );
}

describe('HTML content documents', () => {
  it('renders a sandboxed, titled frame: policy and bootstrap in the head, content in the body', async () => {
    await renderCanvas({ paperMap: papers() });
    const frame = frameOf('root');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.title).toBe('Root');
    const doc = frame.getAttribute('srcdoc')!;
    const head = doc.slice(0, doc.indexOf('<body>'));
    const body = doc.slice(doc.indexOf('<body>'));
    expect(head).toContain(`script-src 'nonce-${nonceOf(frame)}'`);
    expect(head).toContain(`<script nonce="${nonceOf(frame)}">`);
    expect(head).toContain(`const SECRET = '${secretOf(frame)}'`);
    expect(body).toContain('<h1>Report</h1>');
    expect(body).not.toContain('<script nonce');
    // "quiet" is not linked from the content, so it is appended, with its title escaped.
    expect(body).toContain('data-paper-id="quiet">Quiet &lt;b&gt;child&lt;/b&gt;</a>');
  });

  it('gives every document its own nonce and secret, and keeps them while the content is unchanged', async () => {
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: { expansionMap: expansion({ root: ['child'] }) } });
    const first = frameOf('root').getAttribute('srcdoc');
    const [secret, nonce] = [secretOf(frameOf('root')), nonceOf(frameOf('root'))];
    expect(secret).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(secretOf(frameOf('child'))).not.toBe(secret);
    await act(async () => view.handle.current!.dispatch({ type: 'FOCUS_NODE', nodeId: 'child' }));
    await act(async () => view.handle.current!.dispatch({ type: 'FOCUS_NODE', nodeId: 'root' }));
    expect(frameOf('root').getAttribute('srcdoc')).toBe(first);
    await view.rerenderCanvas({ paperMap: papers(`${html}<p>v2</p>`) });
    expect(secretOf(frameOf('root'))).not.toBe(secret);
    expect(nonceOf(frameOf('root'))).not.toBe(nonce);
  });

  it('strips meta refresh and other http-equiv pragmas from the content', async () => {
    await renderCanvas({ paperMap: papers(`<meta http-equiv="refresh" content="0;url=https://evil.test/"><p>after</p>`) });
    const body = frameOf('root').getAttribute('srcdoc')!.split('<body>')[1];
    expect(body).not.toMatch(/http-equiv/i);
    expect(body).toContain('<p>after</p>');
  });
});

describe('the handshake', () => {
  it('only listens over the port of a hello that carries the secret', async () => {
    const view = await renderCanvas({ paperMap: papers() });
    const frame = frameOf('root');
    // Window messages are not part of the protocol.
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'open', paperId: 'child' }, source: frame.contentWindow }));
    });
    // A hello with the wrong secret, or from another window, is ignored.
    const wrong = await connectFrame(frame, { secret: 'guess' });
    await wrong.send({ type: 'open', paperId: 'child' });
    const elsewhere = await connectFrame(frame, { source: window });
    await elsewhere.send({ type: 'open', paperId: 'child' });
    expect(view.handle.current!.getState().expansionMap.size).toBe(0);
    expect(wrong.received).toEqual([]);

    const doc = await connectFrame(frame);
    await doc.send({ type: 'open', paperId: 'child' });
    expect(openIn(view, 'root')).toEqual(['child']);
  });

  it('ignores a hello without a port', async () => {
    const view = await renderCanvas({ paperMap: papers() });
    await act(async () => sayHello(frameOf('root'), secretOf(frameOf('root')), undefined));
    expect(view.handle.current!.getState().expansionMap.size).toBe(0);
  });

  it('switches to the port of a reloaded document and stops listening to the old one', async () => {
    const view = await renderCanvas({ paperMap: papers() });
    const first = await connectFrame(frameOf('root'));
    const second = await connectFrame(frameOf('root'));
    expect(first.port.closed).toBe(false);
    await first.send({ type: 'open', paperId: 'child' });
    expect(openIn(view, 'root')).toEqual([]);
    await second.send({ type: 'open', paperId: 'child' });
    expect(openIn(view, 'root')).toEqual(['child']);
  });

  it('sends the open children on connect and whenever they change', async () => {
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: { expansionMap: expansion({ root: ['child'] }) } });
    const doc = await connectFrame(frameOf('root'));
    expect(doc.received).toContainEqual({ type: 'setOpenIds', openIds: ['child'] });
    await act(async () => view.handle.current!.dispatch({ type: 'OPEN_NODE', parentId: 'root', childId: 'quiet' }));
    await act(async () => {});
    expect(doc.received).toContainEqual({ type: 'setOpenIds', openIds: ['child', 'quiet'] });
  });
});

describe('events from the frame', () => {
  it('opens children, reveals other papers and ignores unknown ids', async () => {
    const view = await renderCanvas({ paperMap: papers() });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'open', paperId: 'child' });
    expect(openIn(view, 'root')).toEqual(['child']);
    await doc.send({ type: 'open', paperId: 'cousin' });
    expect(view.handle.current!.getState().focusedNodeId).toBe('cousin');
    expect(openIn(view, 'other')).toEqual(['cousin']);
    // A link to the paper's own ancestor (here: itself) just focuses it.
    await doc.send({ type: 'open', paperId: 'root' });
    expect(view.handle.current!.getState().focusedNodeId).toBe('root');
    const before = view.handle.current!.getState();
    await doc.send({ type: 'open', paperId: 'ghost' });
    await doc.send({ type: 'open' });
    await doc.send('open');
    expect(view.handle.current!.getState()).toBe(before);
  });

  it('sizes the frame to the reported content height', async () => {
    await renderCanvas({ paperMap: papers() });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'resize', height: 432 });
    expect(frameOf('root').style.height).toBe('432px');
  });

  it('loads only images the content marks, scoped to the paper, and answers on the port', async () => {
    const loadImageUrl = vi.fn(async (fileId: string) => `https://cdn.example/${fileId}`);
    await renderCanvas({ paperMap: papers(), loadImageUrl });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'loadImage', fileId: 'file-1' });
    await doc.send({ type: 'loadImage', fileId: 'someone-elses-file' });
    await act(async () => {});
    expect(loadImageUrl).toHaveBeenCalledTimes(1);
    expect(loadImageUrl).toHaveBeenCalledWith('file-1', { nodeId: 'root' });
    expect(doc.received).toContainEqual({ type: 'setImageUrl', fileId: 'file-1', url: 'https://cdn.example/file-1' });
  });

  it('hands safe external links to the host and drops the rest', async () => {
    const onOpenExternalLink = vi.fn();
    await renderCanvas({ paperMap: papers(), onOpenExternalLink });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'openExternal', href: 'https://example.com/' });
    await doc.send({ type: 'openExternal', href: 'javascript:alert(1)' });
    expect(onOpenExternalLink).toHaveBeenCalledTimes(1);
    expect(onOpenExternalLink).toHaveBeenCalledWith('https://example.com/');
  });

  it('opens external links in a new tab by default', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderCanvas({ paperMap: papers() });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'openExternal', href: 'https://example.com/x' });
    expect(open).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer');
  });
});

describe('dragging a child link out of the content', () => {
  it('starts in page coordinates, follows the forwarded gesture and drops where it ends', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers() });
    const frame = frameOf('root');
    placeFrame(frame, 100, 50);
    const doc = await connectFrame(frame);
    // Only children of the paper can be dragged out of it.
    await doc.send({ type: 'dragstart', paperId: 'cousin', clientX: 10, clientY: 10 });
    expect(ghost('Cousin')).toBeUndefined();

    await doc.send({ type: 'dragstart', paperId: 'child', clientX: 10, clientY: 20 });
    await act(async () => flush());
    expect(ghost('Child')?.style.transform).toBe('translate(122px, 60px)');
    expect(frame.style.pointerEvents).toBe('none');

    await doc.send({ type: 'dragmove', clientX: 40, clientY: 70 });
    await act(async () => flush());
    expect(ghost('Child')?.style.transform).toBe('translate(152px, 110px)');

    // Released over root's room: the child opens there.
    const room = roomBox(view.handle.current!.getSnapshot(), 'root')!;
    await doc.send({ type: 'dragend', clientX: room.x + room.width - 120, clientY: room.y + room.height - 70 });
    expect(ghost('Child')).toBeUndefined();
    expect(openIn(view, 'root')).toEqual(['child']);
    expect(frameOf('root').style.pointerEvents).toBe('auto');
  });

  it('ends without dropping on a forwarded cancel (Escape or pointercancel in the frame)', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers() });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'dragstart', paperId: 'child', clientX: 10, clientY: 20 });
    await act(async () => flush());
    expect(ghost('Child')).toBeDefined();
    await doc.send({ type: 'dragcancel' });
    expect(ghost('Child')).toBeUndefined();
    expect(openIn(view, 'root')).toEqual([]);
  });

  it('lets only the frame that started a drag move, drop or cancel it', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers(), defaultOpenState: { expansionMap: expansion({ root: ['other'] }) } });
    const root = await connectFrame(frameOf('root'));
    const other = await connectFrame(frameOf('other'));
    await root.send({ type: 'dragstart', paperId: 'child', clientX: 10, clientY: 20 });
    await act(async () => flush());
    await other.send({ type: 'dragcancel' });
    await other.send({ type: 'dragend', clientX: 10, clientY: 10 });
    expect(ghost('Child')).toBeDefined();
    await root.send({ type: 'dragcancel' });
    expect(ghost('Child')).toBeUndefined();
    void view;
  });

  it('a press anywhere ends a drag whose release was never seen', async () => {
    const flush = installRafQueue();
    await renderCanvas({ paperMap: papers() });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'dragstart', paperId: 'child', clientX: 10, clientY: 20 });
    await act(async () => flush());
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    expect(ghost('Child')).toBeUndefined();
  });

  it('ends a drag when the frame that started it goes away', async () => {
    const flush = installRafQueue();
    const view = await renderCanvas({ paperMap: papers() });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'dragstart', paperId: 'child', clientX: 10, clientY: 20 });
    await act(async () => flush());
    expect(ghost('Child')).toBeDefined();
    await view.rerenderCanvas({ paperMap: papers(<p>React content now</p>) });
    expect(ghost('Child')).toBeUndefined();
  });

  it('does not drag when dragging is off', async () => {
    await renderCanvas({ paperMap: papers(), draggable: false });
    const doc = await connectFrame(frameOf('root'));
    await doc.send({ type: 'dragstart', paperId: 'child', clientX: 10, clientY: 20 });
    expect(ghost('Child')).toBeUndefined();
  });
});

describe('a frame that leaves its document', () => {
  it('is replaced by a notice when a loaded document does not answer, and comes back with new content', async () => {
    const view = await renderCanvas({ paperMap: papers(), labels: { contentBlocked: 'Stopped.' } });
    await settleFrames();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const doc = await connectFrame(frameOf('root'));

    // The same document reloading answers the check: nothing happens.
    await loadFrame(frameOf('root'));
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS + 10));
    expect(frameOf('root')).not.toBeNull();

    // The frame navigated: the old document is gone and the new one never says hello.
    doc.close();
    await loadFrame(frameOf('root'));
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS - 100));
    expect(frameOf('root')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(200));
    expect(frameOf('root')).toBeNull();
    const notice = document.querySelector('[data-paper-content-blocked="root"]');
    expect(notice?.textContent).toBe('Stopped.');
    expect(notice?.getAttribute('role')).toBe('note');

    vi.useRealTimers();
    await view.rerenderCanvas({ paperMap: papers(`${html}<p>fixed</p>`) });
    expect(frameOf('root')).not.toBeNull();
  });

  it('is replaced when its document leaves and nothing of its own follows, even if nothing loads', async () => {
    await renderCanvas({ paperMap: papers() });
    await settleFrames();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const doc = await connectFrame(frameOf('root'));
    // A foreign page that never finishes loading never fires `load`; the leaving document is
    // enough to start the check.
    // A leaving document is gone before it could answer a ping.
    await act(async () => {
      doc.port.postMessage({ type: 'leaving' });
      doc.close();
    });
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS + 10));
    expect(frameOf('root')).toBeNull();
  });

  it('keeps a frame whose document leaves for a new document of its own', async () => {
    await renderCanvas({ paperMap: papers() });
    await settleFrames();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const doc = await connectFrame(frameOf('root'));
    // A leaving document is gone before it could answer a ping.
    await act(async () => {
      doc.port.postMessage({ type: 'leaving' });
      doc.close();
    });
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS / 3));
    await connectFrame(frameOf('root'));
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS * 2));
    expect(frameOf('root')).not.toBeNull();
  });

  it('accepts a new document of its own that introduces itself after the load', async () => {
    await renderCanvas({ paperMap: papers() });
    await settleFrames();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const first = await connectFrame(frameOf('root'));
    first.close();
    await loadFrame(frameOf('root'));
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS / 2));
    await connectFrame(frameOf('root'));
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS * 2));
    expect(frameOf('root')).not.toBeNull();
  });

  it('does not trust a hello from a document that is already gone', async () => {
    await renderCanvas({ paperMap: papers() });
    await settleFrames();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await connectFrame(frameOf('root'), { answerPings: false });
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS + 10));
    expect(frameOf('root')).toBeNull();
  });

  it('stops a document that keeps reloading itself', async () => {
    await renderCanvas({ paperMap: papers() });
    await settleFrames();
    await connectFrame(frameOf('root'));
    for (let i = 0; i < 6; i += 1) await loadFrame(frameOf('root'));
    expect(frameOf('root')).not.toBeNull();
    await loadFrame(frameOf('root'));
    expect(frameOf('root')).toBeNull();
  });

  it('never checks a frame that has not introduced itself', async () => {
    await renderCanvas({ paperMap: papers() });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await loadFrame(frameOf('root'));
    await act(async () => vi.advanceTimersByTime(FRAME_CHECK_MS * 2));
    expect(frameOf('root')).not.toBeNull();
  });
});

describe('PaperHtmlContent in React content', () => {
  it('embeds with host styles, its own related links and a test id', async () => {
    const map = papers(
      <div>
        <PaperHtmlContent
          nodeId="root"
          html={'<p><a data-paper-id="child">child</a></p>'}
          title="Cover report"
          relatedLinks={[{ id: 'other', title: 'Other' }]}
          baseCss="body { padding: 16px; }"
          data-testid="cover"
        />
      </div>,
    );
    const view = await renderCanvas({ paperMap: map, labels: { relatedLinks: '関連ノード' } });
    const frame = document.querySelector<HTMLIFrameElement>('[data-testid="cover"]')!;
    expect(frame.title).toBe('Cover report');
    const doc = frame.getAttribute('srcdoc')!;
    expect(doc).toContain('body { padding: 16px; }');
    expect(doc).toContain('関連ノード');
    expect(doc).toContain('data-paper-id="other"');
    expect(doc).not.toContain('data-paper-id="quiet"');
    const content = await connectFrame(frame);
    await content.send({ type: 'open', paperId: 'child' });
    expect(openIn(view, 'root')).toEqual(['child']);
  });

  it('fake channels deliver in order and stop after close', async () => {
    const [a, b] = fakeChannel();
    const got: unknown[] = [];
    b.onmessage = ({ data }) => got.push(data);
    a.postMessage(1);
    a.postMessage({ n: 2 });
    await act(async () => {});
    b.close();
    a.postMessage(3);
    await act(async () => {});
    expect(got).toEqual([1, { n: 2 }]);
  });
});
