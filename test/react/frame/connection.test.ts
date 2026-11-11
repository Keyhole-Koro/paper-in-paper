import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFrameConnection,
  FRAME_CHECK_MS,
  RELOAD_LIMIT,
  RELOAD_WINDOW_MS,
  type FrameContext,
} from '../../../src/lib/react/internal/frame/connection';
import type { PaperContentEvent } from '../../../src/lib/react/internal/frame/protocol';
import { fakeChannel, type FakePort } from '../../helpers/frames';

const isPing = (data: unknown): data is { type: 'ping'; seq: number } =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'ping';

/** Runs the fake ports' deliveries (microtasks) without moving the clock. */
const flush = () => vi.advanceTimersByTimeAsync(0);

function setup({ secret = 'S1', openIds = ['a'] }: { secret?: string; openIds?: string[] } = {}) {
  const frame = document.createElement('iframe');
  const current = { secret, openIds };
  const events: PaperContentEvent[] = [];
  const contexts: FrameContext[] = [];
  const onForeignDocument = vi.fn();
  const connection = createFrameConnection({
    frame,
    getSecret: () => current.secret,
    getOpenIds: () => current.openIds,
    onEvent: (event, context) => {
      events.push(event);
      contexts.push(context);
    },
    onForeignDocument,
  });

  /** A document in the frame says hello; it records what the canvas sends and answers pings. */
  const introduce = async (helloSecret = current.secret, { answers = true } = {}) => {
    const [port, canvasPort] = fakeChannel();
    const received: unknown[] = [];
    port.onmessage = ({ data }) => {
      received.push(data);
      if (answers && isPing(data)) port.postMessage({ type: 'pong', seq: data.seq });
    };
    connection.hello(helloSecret, canvasPort as unknown as MessagePort);
    await flush();
    return {
      received,
      canvasPort: canvasPort as FakePort,
      send: async (data: unknown) => {
        port.postMessage(data);
        await flush();
      },
      /** The document is gone: it stops answering. */
      close: () => port.close(),
      /** The document goes, saying so on its way out (it cannot answer anything after). */
      leave: async () => {
        port.postMessage({ type: 'leaving' });
        port.close();
        await flush();
      },
    };
  };
  return { frame, current, events, contexts, onForeignDocument, connection, introduce };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the handshake', () => {
  it('connects only a hello that carries the current secret', async () => {
    const { introduce, current } = setup();
    const stranger = await introduce('S2');
    expect(stranger.received).toEqual([]);
    expect(stranger.canvasPort.closed).toBe(false);

    const own = await introduce('S1');
    expect(own.received).toEqual([{ type: 'setOpenIds', openIds: ['a'] }, { type: 'ping', seq: 1 }]);

    // Without a document of its own (no secret yet), nothing connects.
    current.secret = '';
    expect((await introduce('')).received).toEqual([]);
  });

  it('sends the open ids again on request', async () => {
    const { introduce, current, connection } = setup();
    const doc = await introduce();
    current.openIds = ['a', 'b'];
    connection.sendOpenIds();
    await flush();
    expect(doc.received).toContainEqual({ type: 'setOpenIds', openIds: ['a', 'b'] });
  });

  it('moves to the port of a newer document and closes the old one', async () => {
    const { introduce, events } = setup();
    const first = await introduce();
    const second = await introduce();
    expect(first.canvasPort.closed).toBe(true);
    await first.send({ type: 'open', paperId: 'old' });
    await second.send({ type: 'open', paperId: 'new' });
    expect(events).toEqual([{ type: 'open', paperId: 'new' }]);
  });
});

describe('events', () => {
  it('forwards valid events with a reply on the same port, and drops malformed ones', async () => {
    const { introduce, events, contexts, frame } = setup();
    const doc = await introduce();
    await doc.send({ type: 'open', paperId: 'x' });
    await doc.send({ type: 'open' });
    await doc.send('open');
    expect(events).toEqual([{ type: 'open', paperId: 'x' }]);
    expect(contexts[0].frame).toBe(frame);
    contexts[0].reply({ type: 'setImageUrl', fileId: 'f', url: 'https://img.test/f.png' });
    await flush();
    expect(doc.received).toContainEqual({ type: 'setImageUrl', fileId: 'f', url: 'https://img.test/f.png' });
  });

  it('keeps pongs and leaving notices to itself', async () => {
    const { introduce, events } = setup();
    const doc = await introduce();
    await doc.send({ type: 'pong', seq: 1 });
    await doc.send({ type: 'leaving' });
    expect(events).toEqual([]);
  });
});

describe('checking the document', () => {
  it('keeps a document that answers', async () => {
    const { introduce, onForeignDocument } = setup();
    await introduce();
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS * 3);
    expect(onForeignDocument).not.toHaveBeenCalled();
  });

  it('stops a document that does not answer in time, once, and closes its port', async () => {
    const { introduce, onForeignDocument } = setup();
    const doc = await introduce(undefined, { answers: false });
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS - 1);
    expect(onForeignDocument).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(onForeignDocument).toHaveBeenCalledTimes(1);
    expect(doc.canvasPort.closed).toBe(true);
    // Stopped for good: not even a document with the right secret comes back.
    expect((await introduce()).received).toEqual([]);
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS * 2);
    expect(onForeignDocument).toHaveBeenCalledTimes(1);
  });

  it('expects a document of its own after the current one leaves, whether or not anything loads', async () => {
    const { introduce, onForeignDocument } = setup();
    const doc = await introduce();
    await doc.leave();
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS / 2);
    // Its successor introduces itself in time.
    await introduce();
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS * 2);
    expect(onForeignDocument).not.toHaveBeenCalled();

    const { introduce: introduceAgain, onForeignDocument: stopped } = setup();
    const lonely = await introduceAgain();
    await lonely.leave();
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS + 1);
    expect(stopped).toHaveBeenCalledTimes(1);
  });

  it('checks on load once introduced, and ignores loads before that', async () => {
    const { introduce, connection, onForeignDocument } = setup();
    connection.load();
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS * 2);
    expect(onForeignDocument).not.toHaveBeenCalled();

    const doc = await introduce();
    connection.load();
    await flush();
    expect(doc.received.filter(isPing)).toEqual([{ type: 'ping', seq: 1 }, { type: 'ping', seq: 2 }]);
    doc.close();
    // The load showed something that does not answer.
    connection.load();
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS + 1);
    expect(onForeignDocument).toHaveBeenCalledTimes(1);
  });

  it('stops a frame that keeps reloading, counting per document content', async () => {
    const { introduce, connection, onForeignDocument, current } = setup();
    await introduce();
    for (let i = 0; i < RELOAD_LIMIT; i += 1) connection.load();
    expect(onForeignDocument).not.toHaveBeenCalled();
    // New content starts a new count.
    current.secret = 'S2';
    await introduce('S2');
    for (let i = 0; i < RELOAD_LIMIT; i += 1) connection.load();
    expect(onForeignDocument).not.toHaveBeenCalled();
    // Old loads leave the window.
    await vi.advanceTimersByTimeAsync(RELOAD_WINDOW_MS);
    await introduce('S2');
    for (let i = 0; i < RELOAD_LIMIT; i += 1) connection.load();
    expect(onForeignDocument).not.toHaveBeenCalled();
    connection.load();
    expect(onForeignDocument).toHaveBeenCalledTimes(1);
  });
});

describe('dispose', () => {
  it('closes the port and calls nothing back afterwards', async () => {
    const { introduce, connection, onForeignDocument, events } = setup();
    const doc = await introduce(undefined, { answers: false });
    connection.dispose();
    expect(doc.canvasPort.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(FRAME_CHECK_MS * 2);
    connection.load();
    expect((await introduce()).received).toEqual([]);
    await doc.send({ type: 'open', paperId: 'x' });
    expect(onForeignDocument).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });
});
