import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { PaperId } from '../../core/types';
import { isPaperContentEvent, type PaperContentEvent } from '../internal/iframeBridge';
import { registerFrame } from '../internal/frameRegistry';

/** How long a frame has, after a document loads, to prove the document is the canvas's own. */
export const FRAME_CHECK_MS = 1500;
/** Loads of one document within RELOAD_WINDOW_MS that count as a refresh loop. */
const RELOAD_LIMIT = 6;
const RELOAD_WINDOW_MS = 10_000;

/** Messages the canvas sends to a frame's bootstrap. */
export type FrameMessage =
  | { type: 'setOpenIds'; openIds: PaperId[] }
  | { type: 'setImageUrl'; fileId: string; url: string }
  | { type: 'ping'; seq: number };

interface UseIframeBridgeOptions {
  /** The secret in the frame's current document; only its bootstrap knows it. */
  secret: string;
  /** Ids of the papers currently open inside this paper; their links show as open. */
  openIds?: readonly PaperId[];
  onEvent: (event: PaperContentEvent, context: FrameContext) => void;
  /** The frame shows a document that is not the canvas's own (it navigated), or keeps reloading. */
  onForeignDocument: () => void;
}

export interface FrameContext {
  frame: HTMLIFrameElement;
  /** Answers on the port the event came from. */
  reply: (message: FrameMessage) => void;
}

/**
 * Wires one content iframe to the canvas.
 *
 * The frame's bootstrap introduces itself with the document's secret and a MessagePort; all
 * messages travel over that port, so nothing else on the page (and no document the frame
 * navigates to) can speak for the frame. When the frame's document goes (the bootstrap says
 * `leaving`) or a document loads, the canvas pings the current port: unless a document of its
 * own answers within FRAME_CHECK_MS, the frame shows something else, and `onForeignDocument`
 * takes it down. Returns the iframe's ref callback.
 */
export function useIframeBridge({ secret, openIds, onEvent, onForeignDocument }: UseIframeBridgeOptions) {
  const latest = useRef({ secret, openIds, onEvent, onForeignDocument });
  const portRef = useRef<MessagePort | null>(null);

  useLayoutEffect(() => {
    latest.current = { secret, openIds, onEvent, onForeignDocument };
  });

  const ref = useCallback((el: HTMLIFrameElement | null) => {
    if (!el) return undefined;
    let port: MessagePort | null = null;
    // Checks start with the first handshake: until then the frame has shown nothing but the
    // canvas's own document (whose bootstrap runs before any content).
    let introduced = false;
    let stopped = false;
    let seq = 0;
    let awaiting: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let loads: number[] = [];
    let loadsSecret = latest.current.secret;

    const clearTimer = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    };
    const closePort = () => {
      if (!port) return;
      port.onmessage = null;
      port.close();
      if (portRef.current === port) portRef.current = null;
      port = null;
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimer();
      closePort();
      latest.current.onForeignDocument();
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

    const adopt = (next: MessagePort) => {
      closePort();
      port = next;
      portRef.current = next;
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
        latest.current.onEvent(data, { frame: el, reply: (message) => next.postMessage(message) });
      };
      next.postMessage({ type: 'setOpenIds', openIds: [...(latest.current.openIds ?? [])] } satisfies FrameMessage);
      // The hello may come from a document that is already gone: it has to answer too.
      check();
    };

    const onLoad = () => {
      if (stopped || !introduced) return;
      const now = Date.now();
      if (loadsSecret !== latest.current.secret) {
        loadsSecret = latest.current.secret;
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
    };

    const unregister = registerFrame(el, (helloSecret, next) => {
      // A hello with another secret comes from a document this frame was not given.
      if (stopped || !latest.current.secret || helloSecret !== latest.current.secret) return;
      adopt(next);
    });
    el.addEventListener('load', onLoad);
    return () => {
      unregister();
      el.removeEventListener('load', onLoad);
      clearTimer();
      closePort();
    };
  }, []);

  useEffect(() => {
    portRef.current?.postMessage({ type: 'setOpenIds', openIds: [...(openIds ?? [])] } satisfies FrameMessage);
  }, [openIds]);

  return ref;
}
