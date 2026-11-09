import type { PaperId } from '../../core/types';
import type { PaperColorScheme } from './paperColors';

export interface IframeTheme {
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  text: string;
  mutedText: string;
  divider: string;
  linkBackground: string;
  linkBackgroundHover: string;
  linkBorder: string;
  linkText: string;
}

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

/** The handshake a frame's bootstrap sends to the parent window, carrying its port. */
export interface FrameHello {
  type: 'pip:hello';
  secret: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeInlineStyleText(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

/** A random URL-safe token for a frame's CSP nonce and handshake secret. */
export function createFrameToken(): string {
  const bytes = new Uint8Array(18);
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const SECRET_PLACEHOLDER = '%%PIP_SECRET%%';

/**
 * The only script that runs in content frames. It runs in <head>, before the content is
 * parsed, and takes every DOM function it needs from the prototypes first, so content cannot
 * shadow them (`<img name="addEventListener">` would replace `document.addEventListener`).
 *
 * It opens a MessageChannel and hands one end to the parent with the frame's secret; all
 * further traffic goes over that channel. A page the frame is navigated to cannot know the
 * secret, so the canvas never talks to anything but this bootstrap.
 */
export const BOOTSTRAP_SCRIPT = `
(function () {
  'use strict';
  var SECRET = '${SECRET_PLACEHOLDER}';
  var win = window;
  var doc = document;
  var root = doc.documentElement;
  var parentWindow = win.parent;
  var baseURI = doc.baseURI;
  var on = EventTarget.prototype.addEventListener;
  var closestFn = Element.prototype.closest;
  var queryAll = Element.prototype.querySelectorAll;
  var getAttr = Element.prototype.getAttribute;
  var setAttr = Element.prototype.setAttribute;
  var hasAttr = Element.prototype.hasAttribute;
  var removeAttr = Element.prototype.removeAttribute;
  var rectOf = Element.prototype.getBoundingClientRect;
  var releaseCapture = Element.prototype.releasePointerCapture;
  var hasCapture = Element.prototype.hasPointerCapture;
  var nextFrame = win.requestAnimationFrame.bind(win);
  var styleOf = win.getComputedStyle.bind(win);
  var Observer = win.ResizeObserver;
  var cssEscape = win.CSS && win.CSS.escape ? win.CSS.escape.bind(win.CSS) : function (s) { return String(s).replace(/["\\\\]/g, '\\\\$&'); };
  var DRAG_THRESHOLD = 5;

  var channel = new MessageChannel();
  var port = channel.port1;
  function post(message) { port.postMessage(message); }

  function closest(node, selector) {
    return node && node.nodeType === 1 ? closestFn.call(node, selector) : null;
  }
  function all(selector) { return queryAll.call(root, selector); }
  function body() { return all('body')[0] || null; }

  var lastHeight = -1;
  var heightFrame = 0;
  function postHeight() {
    var b = body();
    if (!b) return;
    var style = styleOf(b);
    var height = Math.ceil(rectOf.call(b).height
      + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0));
    if (Math.abs(height - lastHeight) < 1) return;
    lastHeight = height;
    post({ type: 'resize', height: height });
  }
  function scheduleHeight() {
    if (heightFrame) return;
    heightFrame = nextFrame(function () { heightFrame = 0; postHeight(); });
  }

  var press = null;
  var dragging = false;
  var suppressClick = false;
  var moveFrame = 0;
  var lastMove = null;

  on.call(doc, 'pointerdown', function (e) {
    suppressClick = false;
    press = null;
    if (e.button !== 0) return;
    var link = closest(e.target, '[data-paper-id]');
    if (!link) return;
    press = { link: link, x: e.clientX, y: e.clientY };
    // Touch presses capture to the pressed element; let moves reach the document instead.
    if (e.pointerType === 'touch' && releaseCapture && hasCapture && hasCapture.call(link, e.pointerId)) {
      releaseCapture.call(link, e.pointerId);
    }
  }, true);
  on.call(doc, 'pointermove', function (e) {
    if (dragging) {
      lastMove = { x: e.clientX, y: e.clientY };
      if (!moveFrame) {
        moveFrame = nextFrame(function () {
          moveFrame = 0;
          if (dragging && lastMove) post({ type: 'dragmove', clientX: lastMove.x, clientY: lastMove.y });
        });
      }
      return;
    }
    if (!press) return;
    var dx = e.clientX - press.x;
    var dy = e.clientY - press.y;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    dragging = true;
    suppressClick = true;
    post({ type: 'dragstart', paperId: getAttr.call(press.link, 'data-paper-id'), clientX: e.clientX, clientY: e.clientY });
  }, true);
  on.call(doc, 'pointerup', function (e) {
    press = null;
    if (!dragging) return;
    dragging = false;
    post({ type: 'dragend', clientX: e.clientX, clientY: e.clientY });
  }, true);
  on.call(doc, 'pointercancel', function () {
    press = null;
    if (!dragging) return;
    dragging = false;
    post({ type: 'dragcancel' });
  }, true);

  on.call(doc, 'click', function (e) {
    var link = closest(e.target, '[data-paper-id]');
    if (link) {
      e.preventDefault();
      if (suppressClick) { suppressClick = false; return; }
      post({ type: 'open', paperId: getAttr.call(link, 'data-paper-id') });
      return;
    }
    var anchor = closest(e.target, 'a[href], area[href]');
    if (!anchor) return;
    var href = getAttr.call(anchor, 'href') || '';
    if (href.charAt(0) === '#') return;
    e.preventDefault();
    var resolved = href;
    try { resolved = new URL(href, baseURI).href; } catch (err) { /* left as written */ }
    post({ type: 'openExternal', href: resolved });
  }, true);
  on.call(doc, 'keydown', function (e) {
    if (e.key === 'Escape' && dragging) {
      dragging = false;
      press = null;
      e.preventDefault();
      post({ type: 'dragcancel' });
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var link = closest(e.target, '[data-paper-id]');
    if (!link || hasAttr.call(link, 'href')) return;
    e.preventDefault();
    post({ type: 'open', paperId: getAttr.call(link, 'data-paper-id') });
  }, true);
  on.call(doc, 'submit', function (e) { e.preventDefault(); }, true);
  // Native drag and drop: a dragged image or link would take the pointer away from the paper
  // drag, and a link or file dropped on the frame would navigate it.
  on.call(doc, 'dragstart', function (e) { e.preventDefault(); }, true);
  on.call(doc, 'dragover', function (e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
  }, true);
  on.call(doc, 'drop', function (e) { e.preventDefault(); }, true);

  var openIds = [];
  function markOpen() {
    var links = all('[data-paper-id]');
    for (var i = 0; i < links.length; i++) {
      if (openIds.indexOf(getAttr.call(links[i], 'data-paper-id')) !== -1) setAttr.call(links[i], 'data-open', '');
      else removeAttr.call(links[i], 'data-open');
    }
  }
  function markLinks() {
    var links = all('[data-paper-id]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (hasAttr.call(link, 'href')) continue;
      if (!hasAttr.call(link, 'tabindex')) setAttr.call(link, 'tabindex', '0');
      if (!hasAttr.call(link, 'role')) setAttr.call(link, 'role', 'link');
    }
  }
  // Images are embedded as <img data-file-id> markers with no src. Ask the host
  // to load each file id into a URL; the canvas answers with 'setImageUrl'.
  // data-requested guards against asking twice.
  function requestImages() {
    var images = all('img[data-file-id]:not([data-requested])');
    for (var i = 0; i < images.length; i++) {
      setAttr.call(images[i], 'data-requested', '');
      post({ type: 'loadImage', fileId: getAttr.call(images[i], 'data-file-id') });
    }
  }

  port.onmessage = function (e) {
    var data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ping') {
      post({ type: 'pong', seq: data.seq });
    } else if (data.type === 'setOpenIds' && Array.isArray(data.openIds)) {
      openIds = data.openIds;
      markOpen();
    } else if (data.type === 'setImageUrl' && typeof data.fileId === 'string' && typeof data.url === 'string'
      && /^(https:|data:image\\/|blob:)/i.test(data.url)) {
      var images = all('img[data-file-id="' + cssEscape(data.fileId) + '"]');
      for (var j = 0; j < images.length; j++) {
        on.call(images[j], 'load', scheduleHeight);
        setAttr.call(images[j], 'src', data.url);
      }
    }
  };

  function ready() {
    markLinks();
    markOpen();
    requestImages();
    var b = body();
    if (b && Observer) new Observer(scheduleHeight).observe(b);
    postHeight();
  }
  on.call(doc, 'DOMContentLoaded', ready);
  on.call(win, 'load', function () { requestImages(); postHeight(); });
  // Sent as this document goes: the canvas then expects a new document of its own to say hello,
  // even if the next one never finishes loading.
  on.call(win, 'pagehide', function () { post({ type: 'leaving' }); });

  parentWindow.postMessage({ type: 'pip:hello', secret: SECRET }, '*', [channel.port2]);
})();
`;

/**
 * Content frames run with this policy (on top of the iframe sandbox): no script but the
 * bootstrap (by nonce), no network requests from script, no remote stylesheets or fonts (so CSS
 * cannot chain requests to leak attribute values), no forms, no nested frames.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    'font-src data:',
    'img-src https: data: blob:',
    'media-src https: data: blob:',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
  ].join('; ');
}

/** Font stack for content: system UI fonts with Japanese fallbacks, no network fonts. */
export const CONTENT_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';

/** Structure every frame needs regardless of styling: measurable height and wrapped content. */
const FRAME_RESET_CSS = `
  html, body { margin: 0; }
  body { display: flow-root; overflow: hidden; overflow-wrap: anywhere; }
`;

function defaultContentCss(theme: IframeTheme, fontSize: number, colorScheme: PaperColorScheme): string {
  const mix = colorScheme === 'dark' ? 'black' : 'white';
  return `
  :root {
    color-scheme: ${colorScheme};
    --surface: ${theme.surface};
    --surface-alt: ${theme.surfaceAlt};
    --surface-raised: ${theme.surfaceRaised};
    --text: ${theme.text};
    --muted: ${theme.mutedText};
    --line: ${theme.divider};
    --soft-line: color-mix(in srgb, ${theme.divider} 55%, ${mix});
    --panel: color-mix(in srgb, ${theme.surfaceRaised} 88%, ${mix});
    --quote: color-mix(in srgb, ${theme.linkBackground} 45%, ${mix});
    --code-bg: #201c18;
    --code-text: #f8f4ef;
    --accent: ${theme.linkText};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ${CONTENT_FONT_STACK};
    font-size: ${fontSize}px;
    line-height: 1.7;
    color: var(--text);
  }
  body > * + * { margin-top: 16px; }
  section, article { display: block; }
  h1, h2, h3 {
    line-height: 1.25;
    letter-spacing: -0.01em;
    color: color-mix(in srgb, var(--text) 85%, ${colorScheme === 'dark' ? 'white' : 'black'});
    margin-bottom: 10px;
  }
  h1 { font-size: 1.85em; }
  h2 { font-size: 1.28em; margin-top: 2px; }
  h3 { font-size: 1.06em; }
  p, ul, ol, table, pre, blockquote, figure, details, hr { margin-bottom: 12px; }
  p:last-child, ul:last-child, ol:last-child, table:last-child, pre:last-child,
  blockquote:last-child, figure:last-child, details:last-child { margin-bottom: 0; }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.72em;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .lede { font-size: 1.04em; color: color-mix(in srgb, var(--text) 92%, ${mix}); }
  .hero-block {
    padding: 14px 16px;
    border: 1px solid var(--soft-line);
    border-radius: 16px;
    background: linear-gradient(180deg, var(--surface-raised), var(--surface));
    box-shadow: 0 10px 30px color-mix(in srgb, ${theme.divider} 24%, transparent);
  }
  .callout-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
  .stat-card, .tip-box, details { border: 1px solid var(--soft-line); border-radius: 12px; background: var(--panel); }
  .stat-card { padding: 10px 12px; }
  .stat-card strong { display: block; margin-bottom: 4px; }
  .stat-card span, .mini-note, figcaption, summary { color: var(--muted); }
  .tip-box { padding: 10px 12px; }
  .check-list { padding-left: 1.2em; }
  ul, ol { padding-left: 1.2em; }
  li + li { margin-top: 0.28em; }
  blockquote {
    padding: 10px 14px;
    border-left: 4px solid var(--accent);
    background: var(--quote);
    border-radius: 0 12px 12px 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    overflow: hidden;
    border: 1px solid var(--soft-line);
    border-radius: 12px;
    font-size: 0.94em;
    background: color-mix(in srgb, var(--surface-raised) 78%, ${mix});
  }
  th, td { padding: 9px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--soft-line); }
  th {
    font-size: 0.82em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: color-mix(in srgb, var(--text) 62%, ${mix});
    background: color-mix(in srgb, var(--surface-alt) 82%, ${mix});
  }
  tr:last-child td { border-bottom: none; }
  code, kbd { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; border-radius: 7px; }
  code {
    padding: 0.15em 0.42em;
    background: color-mix(in srgb, ${theme.linkBackground} 32%, ${mix});
    color: color-mix(in srgb, var(--accent) 68%, ${colorScheme === 'dark' ? 'white' : 'black'});
  }
  kbd {
    padding: 0.18em 0.44em;
    border: 1px solid var(--soft-line);
    background: linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 84%, ${mix}), var(--surface-alt));
  }
  pre {
    padding: 12px 14px;
    overflow-x: auto;
    border-radius: 14px;
    background: linear-gradient(180deg, #29231d, #171310);
    color: var(--code-text);
  }
  pre code { padding: 0; background: transparent; color: inherit; }
  mark { padding: 0.08em 0.22em; background: rgba(255, 219, 122, 0.55); color: inherit; border-radius: 4px; }
  hr { border: none; border-top: 1px solid var(--line); }
  a { color: var(--accent); }
  a[data-paper-id] {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    margin: 0 0.12em;
    padding: 0.1em 0.58em;
    border: 1px solid ${theme.linkBorder};
    border-radius: 999px;
    background: ${theme.linkBackground};
    color: ${theme.linkText};
    text-decoration: none;
    font-weight: 600;
    line-height: 1.4;
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }
  a[data-paper-id]::after { content: '↗'; font-size: 0.82em; opacity: 0.72; }
  a[data-paper-id][data-open] { background: ${theme.linkText}; border-color: ${theme.linkText}; color: ${theme.surface}; }
  a[data-paper-id][data-open]::after { content: '✓'; opacity: 0.9; }
  a[data-paper-id][data-open]:hover { background: ${theme.linkText}; transform: none; }
  a[data-paper-id]:hover { background: ${theme.linkBackgroundHover}; transform: translateY(-1px); }
  a[data-paper-id]:active { transform: translateY(0); }
  a[data-paper-id]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  figure { margin: 12px 0; }
  img { display: block; width: 100%; max-width: 100%; height: auto; border-radius: 12px; border: 1px solid rgba(127, 127, 127, 0.18); object-fit: cover; }
  figcaption { margin-top: 6px; font-size: 12px; line-height: 1.45; color: var(--muted); }
  details { padding: 10px 12px; }
  summary { cursor: pointer; font-weight: 600; user-select: none; }
  .pip-related { margin-top: 16px; }
  .pip-related-links { display: flex; flex-wrap: wrap; gap: 8px; }
`;
}

const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>?/gi;
const QUOTED = /"[^"]*"|'[^']*'/g;

/**
 * Removes `<meta http-equiv>` from content: `refresh` would navigate the frame away from the
 * canvas's document and policy. This only keeps ordinary content working; the canvas also
 * stops showing a frame whose document is not its own (see `useIframeBridge`).
 */
export function stripHttpEquiv(html: string): string {
  return html.replace(META_TAG, (tag) => (/\bhttp-equiv\b/i.test(tag.replace(QUOTED, '')) ? '' : tag));
}

export interface SrcDocOptions {
  /** Content HTML (already including any appended related links). */
  html: string;
  theme: IframeTheme;
  fontSize: number;
  /** CSP nonce for the bootstrap script. */
  nonce: string;
  /** Secret the bootstrap presents in its handshake. */
  secret: string;
  colorScheme?: PaperColorScheme;
  /** Extra CSS applied after the base styles. */
  overrideCss?: string;
  /** Replaces the built-in content styles entirely (the frame reset stays). */
  baseCss?: string;
}

export function buildSrcDoc(options: SrcDocOptions): string {
  const colorScheme = options.colorScheme ?? 'light';
  const base = options.baseCss ?? defaultContentCss(options.theme, options.fontSize, colorScheme);
  const override = options.overrideCss
    ? `\n<style data-paper-override-css>\n${escapeInlineStyleText(options.overrideCss)}\n</style>`
    : '';
  const script = BOOTSTRAP_SCRIPT.replace(SECRET_PLACEHOLDER, options.secret.replace(/[^A-Za-z0-9_-]/g, ''));
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(options.nonce)}" />
<meta name="referrer" content="no-referrer" />
<script nonce="${escapeHtml(options.nonce)}">${script}</script>
<style>${FRAME_RESET_CSS}</style>
<style>${escapeInlineStyleText(base)}</style>${override}
</head>
<body>
${stripHttpEquiv(options.html)}
</body>
</html>`;
}

const PAPER_ID_ATTRIBUTE = /data-paper-id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const FILE_ID_ATTRIBUTE = /data-file-id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

function attributeValues(html: string, pattern: RegExp): Set<string> {
  const values = new Set<string>();
  for (const match of html.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value) values.add(decodeAttribute(value));
  }
  return values;
}

function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** Paper ids the HTML links to with `data-paper-id`. */
export function findLinkedPaperIds(html: string): Set<string> {
  return attributeValues(html, PAPER_ID_ATTRIBUTE);
}

/** File ids of `<img data-file-id>` markers in the HTML. */
export function findImageMarkerIds(html: string): Set<string> {
  return attributeValues(html, FILE_ID_ATTRIBUTE);
}

/**
 * Appends links to the children the content does not link to itself, so every child stays
 * reachable. Titles and ids are escaped: they are data, not markup.
 */
export function appendRelatedLinks(
  html: string,
  children: ReadonlyArray<{ id: PaperId; title: string }>,
  heading: string,
): string {
  const linked = findLinkedPaperIds(html);
  const missing = children.filter((child) => !linked.has(child.id));
  if (missing.length === 0) return html;
  const links = missing
    .map((child) => `<a data-paper-id="${escapeHtml(child.id)}">${escapeHtml(child.title || child.id)}</a>`)
    .join('');
  return `${html}<hr/><div class="pip-related"><p class="eyebrow">${escapeHtml(heading)}</p><p class="pip-related-links">${links}</p></div>`;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

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

/** http(s) and mailto links only: anything else (javascript:, data:, about:) is dropped. */
export function safeExternalHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:' ? url.href : null;
}
