// @ts-check
// The only script that runs in content frames (see srcDoc.ts). It is shipped as text, exactly as
// written here, so it must stay a self-contained classic script: no imports, no outer names.
// It runs in <head>, before the content is parsed, and takes every DOM function it needs from
// the prototypes first, so content cannot shadow them (`<img name="addEventListener">` would
// replace `document.addEventListener`).
//
// It opens a MessageChannel and hands one end to the parent with the frame's secret; all further
// traffic goes over that channel. A page the frame is navigated to cannot know the secret, so the
// canvas never talks to anything but this bootstrap.
(function () {
  'use strict';
  const SECRET = '%%PIP_SECRET%%';
  const win = window;
  const doc = document;
  const root = doc.documentElement;
  const parentWindow = win.parent;
  const baseURI = doc.baseURI;
  const on = EventTarget.prototype.addEventListener;
  const closestFn = Element.prototype.closest;
  const queryAll = Element.prototype.querySelectorAll;
  const getAttr = Element.prototype.getAttribute;
  const setAttr = Element.prototype.setAttribute;
  const hasAttr = Element.prototype.hasAttribute;
  const removeAttr = Element.prototype.removeAttribute;
  const rectOf = Element.prototype.getBoundingClientRect;
  // Not every environment has these (jsdom has no pointer capture or ResizeObserver).
  /** @type {Element['releasePointerCapture'] | undefined} */
  const releaseCapture = Element.prototype.releasePointerCapture;
  /** @type {Element['hasPointerCapture'] | undefined} */
  const hasCapture = Element.prototype.hasPointerCapture;
  /** @type {typeof ResizeObserver | undefined} */
  const Observer = win.ResizeObserver;
  const css = /** @type {typeof CSS | undefined} */ (win.CSS);
  const nextFrame = win.requestAnimationFrame.bind(win);
  const styleOf = win.getComputedStyle.bind(win);
  /** @type {(value: string) => string} */
  const cssEscape = css && css.escape ? css.escape.bind(css) : (value) => String(value).replace(/["\\]/g, '\\$&');
  const DRAG_THRESHOLD = 5;

  const channel = new MessageChannel();
  const port = channel.port1;
  /** @param {import('./protocol').PaperContentEvent} message */
  function post(message) {
    port.postMessage(message);
  }

  /**
   * Listens on the document in the capture phase, before the content's own listeners.
   * @template {keyof DocumentEventMap} K
   * @param {K} type
   * @param {(event: DocumentEventMap[K]) => void} listener
   */
  function onDocument(type, listener) {
    on.call(doc, type, /** @type {EventListener} */ (listener), true);
  }
  /**
   * @param {EventTarget | null} target
   * @param {string} selector
   * @returns {Element | null}
   */
  function closest(target, selector) {
    const node = /** @type {Node | null} */ (target);
    return node && node.nodeType === 1 ? closestFn.call(/** @type {Element} */ (node), selector) : null;
  }
  /** @param {string} selector */
  function all(selector) {
    return queryAll.call(root, selector);
  }
  function body() {
    return all('body')[0] || null;
  }
  /** @param {Element} link */
  function openLink(link) {
    const paperId = getAttr.call(link, 'data-paper-id');
    if (paperId !== null) post({ type: 'open', paperId });
  }

  let lastHeight = -1;
  let heightFrame = 0;
  function postHeight() {
    const b = body();
    if (!b) return;
    const style = styleOf(b);
    const height = Math.ceil(rectOf.call(b).height
      + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0));
    if (Math.abs(height - lastHeight) < 1) return;
    lastHeight = height;
    post({ type: 'resize', height });
  }
  function scheduleHeight() {
    if (heightFrame) return;
    heightFrame = nextFrame(() => {
      heightFrame = 0;
      postHeight();
    });
  }

  /** @type {{ link: Element, x: number, y: number } | null} */
  let press = null;
  let dragging = false;
  let suppressClick = false;
  let moveFrame = 0;
  /** @type {{ x: number, y: number } | null} */
  let lastMove = null;

  onDocument('pointerdown', (e) => {
    suppressClick = false;
    press = null;
    if (e.button !== 0) return;
    const link = closest(e.target, '[data-paper-id]');
    if (!link) return;
    press = { link, x: e.clientX, y: e.clientY };
    // Touch presses capture to the pressed element; let moves reach the document instead.
    if (e.pointerType === 'touch' && releaseCapture && hasCapture && hasCapture.call(link, e.pointerId)) {
      releaseCapture.call(link, e.pointerId);
    }
  });
  onDocument('pointermove', (e) => {
    if (dragging) {
      lastMove = { x: e.clientX, y: e.clientY };
      if (!moveFrame) {
        moveFrame = nextFrame(() => {
          moveFrame = 0;
          if (dragging && lastMove) post({ type: 'dragmove', clientX: lastMove.x, clientY: lastMove.y });
        });
      }
      return;
    }
    if (!press) return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    const paperId = getAttr.call(press.link, 'data-paper-id');
    if (paperId === null) return;
    dragging = true;
    suppressClick = true;
    post({ type: 'dragstart', paperId, clientX: e.clientX, clientY: e.clientY });
  });
  onDocument('pointerup', (e) => {
    press = null;
    if (!dragging) return;
    dragging = false;
    post({ type: 'dragend', clientX: e.clientX, clientY: e.clientY });
  });
  onDocument('pointercancel', () => {
    press = null;
    if (!dragging) return;
    dragging = false;
    post({ type: 'dragcancel' });
  });

  onDocument('click', (e) => {
    const link = closest(e.target, '[data-paper-id]');
    if (link) {
      e.preventDefault();
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      openLink(link);
      return;
    }
    const anchor = closest(e.target, 'a[href], area[href]');
    if (!anchor) return;
    const href = getAttr.call(anchor, 'href') || '';
    if (href.charAt(0) === '#') return;
    e.preventDefault();
    let resolved = href;
    try {
      resolved = new URL(href, baseURI).href;
    } catch {
      // Left as written; the canvas only lets well-formed http(s) and mailto links out.
    }
    post({ type: 'openExternal', href: resolved });
  });
  onDocument('keydown', (e) => {
    if (e.key === 'Escape' && dragging) {
      dragging = false;
      press = null;
      e.preventDefault();
      post({ type: 'dragcancel' });
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const link = closest(e.target, '[data-paper-id]');
    if (!link || hasAttr.call(link, 'href')) return;
    e.preventDefault();
    openLink(link);
  });
  onDocument('submit', (e) => {
    e.preventDefault();
  });
  // Native drag and drop: a dragged image or link would take the pointer away from the paper
  // drag, and a link or file dropped on the frame would navigate it.
  onDocument('dragstart', (e) => {
    e.preventDefault();
  });
  onDocument('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  });
  onDocument('drop', (e) => {
    e.preventDefault();
  });

  /** @type {unknown[]} */
  let openIds = [];
  function markOpen() {
    const links = all('[data-paper-id]');
    for (let i = 0; i < links.length; i += 1) {
      if (openIds.indexOf(getAttr.call(links[i], 'data-paper-id')) !== -1) setAttr.call(links[i], 'data-open', '');
      else removeAttr.call(links[i], 'data-open');
    }
  }
  function markLinks() {
    const links = all('[data-paper-id]');
    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      if (hasAttr.call(link, 'href')) continue;
      if (!hasAttr.call(link, 'tabindex')) setAttr.call(link, 'tabindex', '0');
      if (!hasAttr.call(link, 'role')) setAttr.call(link, 'role', 'link');
    }
  }
  // Images are embedded as <img data-file-id> markers with no src. Ask the host to load each
  // file id into a URL; the canvas answers with 'setImageUrl'. data-requested guards against
  // asking twice.
  function requestImages() {
    const images = all('img[data-file-id]:not([data-requested])');
    for (let i = 0; i < images.length; i += 1) {
      setAttr.call(images[i], 'data-requested', '');
      const fileId = getAttr.call(images[i], 'data-file-id');
      if (fileId !== null) post({ type: 'loadImage', fileId });
    }
  }

  // Messages from the canvas (see FrameMessage in protocol.ts). They are checked here too: the
  // port is private, but a bug on either side should not become a broken page.
  port.onmessage = (e) => {
    const data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ping') {
      post({ type: 'pong', seq: data.seq });
    } else if (data.type === 'setOpenIds' && Array.isArray(data.openIds)) {
      openIds = data.openIds;
      markOpen();
    } else if (data.type === 'setImageUrl' && typeof data.fileId === 'string' && typeof data.url === 'string'
      && /^(https:|data:image\/|blob:)/i.test(data.url)) {
      const images = all('img[data-file-id="' + cssEscape(data.fileId) + '"]');
      for (let i = 0; i < images.length; i += 1) {
        on.call(images[i], 'load', scheduleHeight);
        setAttr.call(images[i], 'src', data.url);
      }
    }
  };

  function ready() {
    markLinks();
    markOpen();
    requestImages();
    const b = body();
    if (b && Observer) new Observer(scheduleHeight).observe(b);
    postHeight();
  }
  on.call(doc, 'DOMContentLoaded', ready);
  on.call(win, 'load', () => {
    requestImages();
    postHeight();
  });
  // Sent as this document goes: the canvas then expects a new document of its own to say hello,
  // even if the next one never finishes loading.
  on.call(win, 'pagehide', () => {
    post({ type: 'leaving' });
  });

  /** @type {import('./protocol').FrameHello} */
  const hello = { type: 'pip:hello', secret: SECRET };
  parentWindow.postMessage(hello, '*', [channel.port2]);
})();
