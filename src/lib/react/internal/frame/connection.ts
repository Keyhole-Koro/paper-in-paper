import type { PaperId } from '../../../core/types';
import { isPaperContentEvent, type FrameMessage, type PaperContentEvent } from './protocol';

/** How long a frame has, after a document loads or leaves, to prove the document is the canvas's own. */
export const FRAME_CHECK_MS = 1500;
/** More loads than this within RELOAD_WINDOW_MS count as a refresh loop. */
export const RELOAD_LIMIT = 6;
export const RELOAD_WINDOW_MS = 10_000;

export interface FrameContext {
  frame: HTMLIFrameElement;
  /** Answers on the port the event came from. */
  reply: (message: FrameMessage) => void;
}

export interface FrameConnectionOptions {
  frame: HTMLIFrameElement;
  /** The secret in the frame's current document; only its bootstrap knows it. Read on use. */
  getSecret: () => string;
  /** Ids of the papers open inside this paper; their links show as open. Read on use. */
  getOpenIds: () => readonly PaperId[];
  onEvent: (event: PaperContentEvent, context: FrameContext) => void;
  /** The frame shows a document that is not the canvas's own (it navigated), or keeps reloading. */
  onForeignDocument: () => void;
}

export interface FrameConnection {
  /** A document in the frame introduced itself (see the frame registry). */
  hello(secret: string, port: MessagePort): void;
  /** The frame fired `load`. */
  load(): void;
  /** Tells the current document which links are open. */
  sendOpenIds(): void;
  /** Closes the port and stops checking. Nothing is called back afterwards. */
  dispose(): void;
}

/**
 * The canvas's side of one content frame.
 *
 * The frame's bootstrap introduces itself with the document's secret and a MessagePort; all
 * messages travel over that port, so nothing else on the page (and no document the frame
 * navigates to) can speak for the frame. When the frame's document goes (the bootstrap says
 * `leaving`) or a document loads, the canvas pings the current port: unless a document of its
 * own answers within FRAME_CHECK_MS, the frame shows something else, and `onForeignDocument`
 * takes it down. So does a frame that loads more than RELOAD_LIMIT times in RELOAD_WINDOW_MS.
 *
 * Checks start with the first hello: until then the frame has shown nothing but the canvas's
 * own document, whose bootstrap runs before any content.
 */
export function createFrameConnection(options: FrameConnectionOptions): FrameConnection {
  const { frame } = options;
  let port: MessagePort | null = null;
  let introduced = false;
  // Stopped: the frame showed something else. Disposed: the frame is gone.
  let stopped = false;
  let disposed = false;
  let seq = 0;
  let awaiting: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let loads: number[] = [];
  let loadsSecret = options.getSecret();

  const clearTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  const closePort = () => {
    if (!port) return;
    port.onmessage = null;
    port.close();
    port = null;
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimer();
    closePort();
    options.onForeignDocument();
  };
  // Asks the document on the current port to answer; without an answer in time, stop.
  const check = () => {
    seq += 1;
    awaiting = seq;
    port?.postMessage({ type: 'ping', seq } satisfies FrameMessage);
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (awaiting !== null) stop();
    }, FRAME_CHECK_MS);
  };
  const sendOpenIds = () => {
    port?.postMessage({ type: 'setOpenIds', openIds: [...options.getOpenIds()] } satisfies FrameMessage);
  };

  const adopt = (next: MessagePort) => {
    closePort();
    port = next;
    introduced = true;
    next.onmessage = (event: MessageEvent) => {
      if (port !== next || !isPaperContentEvent(event.data)) return;
      const data = event.data;
      if (data.type === 'pong') {
        if (data.seq === awaiting) {
          awaiting = null;
          clearTimer();
        }
        return;
      }
      if (data.type === 'leaving') {
        // The next document has to introduce itself in time, whether or not it ever fires
        // `load` (a page can keep loading forever).
        check();
        return;
      }
      options.onEvent(data, { frame, reply: (message) => next.postMessage(message) });
    };
    sendOpenIds();
    // The hello may come from a document that is already gone: it has to answer too.
    check();
  };

  return {
    hello(secret, next) {
      // A hello with another secret comes from a document this frame was not given.
      const expected = options.getSecret();
      if (disposed || stopped || !expected || secret !== expected) return;
      adopt(next);
    },
    load() {
      if (disposed || stopped || !introduced) return;
      const now = Date.now();
      const secret = options.getSecret();
      if (loadsSecret !== secret) {
        loadsSecret = secret;
        loads = [];
      }
      loads = loads.filter((time) => now - time < RELOAD_WINDOW_MS);
      loads.push(now);
      if (loads.length > RELOAD_LIMIT) {
        stop();
        return;
      }
      // When this load is a new document of ours, its hello brings a new port and a new check.
      check();
    },
    sendOpenIds,
    dispose() {
      disposed = true;
      clearTimer();
      closePort();
    },
  };
}
