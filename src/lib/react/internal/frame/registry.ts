import { isFrameHello } from './protocol';

type HelloHandler = (secret: string, port: MessagePort) => void;

/**
 * One window `message` listener for every content frame on the page. It only handles the
 * `pip:hello` handshake: the hello goes to the frame element whose window sent it, compared at
 * message time (a frame gets a new window whenever it reloads). Everything after the hello
 * travels over the MessagePort the hello carried.
 */
const frames = new Map<HTMLIFrameElement, HelloHandler>();

function onMessage(event: MessageEvent) {
  if (!event.source || !isFrameHello(event.data) || event.ports.length !== 1) return;
  for (const [frame, handler] of frames) {
    if (frame.contentWindow !== event.source) continue;
    handler(event.data.secret, event.ports[0]);
    return;
  }
  // Not a frame of this canvas (another copy of the library may own it): leave it alone.
}

export function registerFrame(frame: HTMLIFrameElement, onHello: HelloHandler): () => void {
  if (frames.size === 0) window.addEventListener('message', onMessage);
  frames.set(frame, onHello);
  return () => {
    if (frames.get(frame) !== onHello) return;
    frames.delete(frame);
    if (frames.size === 0) window.removeEventListener('message', onMessage);
  };
}
