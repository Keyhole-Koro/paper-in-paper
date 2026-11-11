import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { PaperId } from '../../core/types';
import { createFrameConnection, type FrameConnection, type FrameContext } from '../internal/frame/connection';
import type { PaperContentEvent } from '../internal/frame/protocol';
import { registerFrame } from '../internal/frame/registry';

export type { FrameContext };

interface UseIframeBridgeOptions {
  /** The secret in the frame's current document; only its bootstrap knows it. */
  secret: string;
  /** Ids of the papers currently open inside this paper; their links show as open. */
  openIds?: readonly PaperId[];
  onEvent: (event: PaperContentEvent, context: FrameContext) => void;
  /** The frame shows a document that is not the canvas's own (it navigated), or keeps reloading. */
  onForeignDocument: () => void;
}

const NO_IDS: readonly PaperId[] = [];

/**
 * Wires one content iframe to the canvas (see `createFrameConnection` for the protocol): hellos
 * reach it through the frame registry, `load` events from the element. Returns the iframe's ref
 * callback.
 */
export function useIframeBridge({ secret, openIds, onEvent, onForeignDocument }: UseIframeBridgeOptions) {
  const latest = useRef({ secret, openIds, onEvent, onForeignDocument });
  const connectionRef = useRef<FrameConnection | null>(null);

  useLayoutEffect(() => {
    latest.current = { secret, openIds, onEvent, onForeignDocument };
  });

  const ref = useCallback((frame: HTMLIFrameElement | null) => {
    if (!frame) return undefined;
    const connection = createFrameConnection({
      frame,
      getSecret: () => latest.current.secret,
      getOpenIds: () => latest.current.openIds ?? NO_IDS,
      onEvent: (event, context) => latest.current.onEvent(event, context),
      onForeignDocument: () => latest.current.onForeignDocument(),
    });
    connectionRef.current = connection;
    const unregister = registerFrame(frame, connection.hello);
    frame.addEventListener('load', connection.load);
    return () => {
      unregister();
      frame.removeEventListener('load', connection.load);
      connection.dispose();
      if (connectionRef.current === connection) connectionRef.current = null;
    };
  }, []);

  useEffect(() => {
    connectionRef.current?.sendOpenIds();
  }, [openIds]);

  return ref;
}
