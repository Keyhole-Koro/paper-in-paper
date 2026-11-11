import { act } from '@testing-library/react';
import type { PaperContentTheme } from '../../src/lib/react/internal/contentTheme';
import { buildSrcDoc, type SrcDocOptions } from '../../src/lib/react/internal/frame/srcDoc';

export const testTheme: PaperContentTheme = {
  surface: '#fff', surfaceAlt: '#eee', surfaceRaised: '#ddd', text: '#111', mutedText: '#666',
  divider: '#ccc', linkBackground: '#f0f0f0', linkBackgroundHover: '#e0e0e0', linkBorder: '#bbb', linkText: '#222',
};

/** A content frame document with test defaults (nonce NONCE, secret SECRET1). */
export const buildTestDoc = (options: Partial<SrcDocOptions> = {}) =>
  buildSrcDoc({ html: '<p>hello</p>', theme: testTheme, fontSize: 14, nonce: 'NONCE', secret: 'SECRET1', ...options });

export interface FakePort {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(data: unknown): void;
  close(): void;
  readonly closed: boolean;
}

/**
 * A MessageChannel whose ports deliver in a microtask (`await act(async () => {})` flushes
 * them) and record whether they were closed. Messages are structured-cloned, like real ports.
 */
export function fakeChannel(): [FakePort, FakePort] {
  const make = () => {
    let other: { port: FakePort } | null = null;
    let closed = false;
    const port: FakePort = {
      onmessage: null,
      get closed() {
        return closed;
      },
      postMessage(data: unknown) {
        const target = other!.port;
        if (closed || target.closed) return;
        const copy = structuredClone(data);
        queueMicrotask(() => {
          if (!target.closed) target.onmessage?.({ data: copy });
        });
      },
      close() {
        closed = true;
      },
    };
    return { port, link: (to: { port: FakePort }) => { other = to; } };
  };
  const a = make();
  const b = make();
  a.link(b);
  b.link(a);
  return [a.port, b.port];
}

/** The handshake secret built into a content frame's document. */
export function secretOf(frame: HTMLIFrameElement): string {
  return /const SECRET = '([^']*)'/.exec(frame.getAttribute('srcdoc') ?? '')?.[1] ?? '';
}

/** The CSP nonce of a content frame's document. */
export function nonceOf(frame: HTMLIFrameElement): string {
  return /<script nonce="([^"]*)">/.exec(frame.getAttribute('srcdoc') ?? '')?.[1] ?? '';
}

export interface FakeFrameDocument {
  /** Messages the canvas sent to this document. */
  received: unknown[];
  /** Sends a message to the canvas, as the bootstrap would. */
  send(data: unknown): Promise<void>;
  /** The document is gone: it stops answering. */
  close(): void;
  port: FakePort;
}

const isPing = (data: unknown): data is { type: 'ping'; seq: number } =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'ping';

/** Dispatches a `pip:hello` to the window, as a frame's bootstrap would. */
export function sayHello(frame: HTMLIFrameElement, secret: string, port: unknown, source: MessageEventSource | null = frame.contentWindow) {
  const event = new MessageEvent('message', { data: { type: 'pip:hello', secret }, source });
  Object.defineProperty(event, 'ports', { value: port === undefined ? [] : [port] });
  window.dispatchEvent(event);
}

/**
 * Plays a frame's bootstrap: says hello with the document's secret over a fresh channel and
 * answers the canvas's pings (unless `answerPings` is false).
 */
export async function connectFrame(
  frame: HTMLIFrameElement,
  { secret = secretOf(frame), source = frame.contentWindow as MessageEventSource | null, answerPings = true } = {},
): Promise<FakeFrameDocument> {
  const [port, canvasPort] = fakeChannel();
  const received: unknown[] = [];
  port.onmessage = ({ data }) => {
    received.push(data);
    if (answerPings && isPing(data)) port.postMessage({ type: 'pong', seq: data.seq });
  };
  await act(async () => {
    sayHello(frame, secret, canvasPort, source);
  });
  await act(async () => {});
  return {
    received,
    port,
    send: async (data) => {
      await act(async () => {
        port.postMessage(data);
      });
      await act(async () => {});
    },
    close: () => port.close(),
  };
}

/** Fires the frame's load event, as when a document finished loading in it. */
export async function loadFrame(frame: HTMLIFrameElement) {
  await act(async () => {
    frame.dispatchEvent(new Event('load'));
  });
  await act(async () => {});
}
