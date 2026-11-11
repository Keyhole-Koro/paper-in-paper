import type { PaperId } from '../../../core/types';

/**
 * Messages a content frame sends to the canvas, over the private MessageChannel it opens in
 * its `pip:hello` handshake. Coordinates are in the frame's own viewport.
 */
export type PaperContentEvent =
  | { type: 'open'; paperId: PaperId }
  | { type: 'dragstart'; paperId: PaperId; clientX: number; clientY: number }
  // While a link drag runs, the browser keeps sending the gesture to the frame it started in,
  // so the frame forwards it.
  | { type: 'dragmove'; clientX: number; clientY: number }
  | { type: 'dragend'; clientX: number; clientY: number }
  | { type: 'dragcancel' }
  | { type: 'resize'; height: number }
  // Emitted for each <img data-file-id> marker in the content: the host loads
  // the file id to a URL and the canvas replies with 'setImageUrl'. The marker has
  // no src, so the image stays blank until the host answers.
  | { type: 'loadImage'; fileId: string }
  // A regular link was clicked. The sandbox cannot navigate the page or open tabs,
  // so the host decides what to do with the URL.
  | { type: 'openExternal'; href: string }
  // Answer to the canvas's 'ping': the document that holds this port is still the frame's.
  | { type: 'pong'; seq: number }
  // The document is being replaced (pagehide). Whatever comes next must introduce itself.
  | { type: 'leaving' };

/** Messages the canvas sends to a frame's bootstrap. */
export type FrameMessage =
  | { type: 'setOpenIds'; openIds: PaperId[] }
  | { type: 'setImageUrl'; fileId: string; url: string }
  | { type: 'ping'; seq: number };

/** The handshake a frame's bootstrap sends to the parent window, carrying its port. */
export interface FrameHello {
  type: 'pip:hello';
  secret: string;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Whether a message from a frame's port is one the canvas understands (anything else is dropped). */
export function isPaperContentEvent(data: unknown): data is PaperContentEvent {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  switch (d.type) {
    case 'open':
      return typeof d.paperId === 'string';
    case 'dragstart':
      return typeof d.paperId === 'string' && finite(d.clientX) && finite(d.clientY);
    case 'dragmove':
    case 'dragend':
      return finite(d.clientX) && finite(d.clientY);
    case 'dragcancel':
      return true;
    case 'resize':
      return finite(d.height) && d.height >= 0;
    case 'loadImage':
      return typeof d.fileId === 'string';
    case 'openExternal':
      return typeof d.href === 'string';
    case 'pong':
      return finite(d.seq);
    case 'leaving':
      return true;
    default:
      return false;
  }
}

export function isFrameHello(data: unknown): data is FrameHello {
  return typeof data === 'object' && data !== null
    && (data as Record<string, unknown>).type === 'pip:hello'
    && typeof (data as Record<string, unknown>).secret === 'string';
}
