import type { PaperId } from '../../core/types';

interface IframeTheme {
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

export type PaperContentEvent =
  | { type: 'open'; paperId: PaperId }
  | { type: 'dragstart'; paperId: PaperId; clientX: number; clientY: number }
  | { type: 'resize'; height: number };

function escapeInlineStyleText(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

const BOOTSTRAP_SCRIPT = `
(function () {
  var DRAG_THRESHOLD = 5;
  var lastHeight = 0;
  var resizeRaf = 0;

  function postHeight() {
    var h = document.documentElement.scrollHeight;
    if (Math.abs(h - lastHeight) < 8) return;
    lastHeight = h;
    parent.postMessage({ type: 'resize', height: h }, '*');
  }

  function notifyHeight() {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = 0;
      postHeight();
    });
  }

  var observer = new ResizeObserver(notifyHeight);
  observer.observe(document.body);
  postHeight();

  var downEl = null;
  var downX = 0;
  var downY = 0;
  var didDrag = false;

  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('[data-paper-id]');
    if (!el) return;
    downEl = el;
    downX = e.clientX;
    downY = e.clientY;
    didDrag = false;
  });

  document.addEventListener('pointermove', function (e) {
    if (!downEl || didDrag) return;
    var dx = e.clientX - downX;
    var dy = e.clientY - downY;
    if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;

    didDrag = true;
    parent.postMessage({
      type: 'dragstart',
      paperId: downEl.getAttribute('data-paper-id'),
      clientX: e.clientX,
      clientY: e.clientY,
    }, '*');
  });

  document.addEventListener('pointerup', function (e) {
    if (!downEl) return;
    var dx = e.clientX - downX;
    var dy = e.clientY - downY;
    if (!didDrag && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) {
      e.preventDefault();
      parent.postMessage({ type: 'open', paperId: downEl.getAttribute('data-paper-id') }, '*');
    }
    downEl = null;
    didDrag = false;
  });

  document.addEventListener('pointercancel', function () {
    downEl = null;
    didDrag = false;
  });

  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'setOpenIds') return;
    var ids = e.data.openIds;
    document.querySelectorAll('a[data-paper-id]').forEach(function (el) {
      if (ids.indexOf(el.getAttribute('data-paper-id')) !== -1) {
        el.setAttribute('data-open', '');
      } else {
        el.removeAttribute('data-open');
      }
    });
  });
})();
`;

export function buildSrcDoc(content: string, theme: IframeTheme, fontSize: number, overrideCss?: string): string {
  const injectedCss = overrideCss ? `\n<style data-paper-override-css>\n${escapeInlineStyleText(overrideCss)}\n</style>` : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet" />
<style>
  :root {
    color-scheme: light;
    --surface: ${theme.surface};
    --surface-alt: ${theme.surfaceAlt};
    --surface-raised: ${theme.surfaceRaised};
    --text: ${theme.text};
    --muted: ${theme.mutedText};
    --line: ${theme.divider};
    --soft-line: color-mix(in srgb, ${theme.divider} 55%, white);
    --panel: color-mix(in srgb, ${theme.surfaceRaised} 88%, white);
    --quote: color-mix(in srgb, ${theme.linkBackground} 45%, white);
    --code-bg: #201c18;
    --code-text: #f8f4ef;
    --accent: ${theme.linkText};
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
    font-size: ${fontSize}px;
    line-height: 1.7;
    color: var(--text);
    padding: 0;
    overflow: hidden;
  }
  body > * + * {
    margin-top: 16px;
  }
  section,
  article {
    display: block;
  }
  h1, h2, h3 {
    font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: color-mix(in srgb, var(--text) 85%, black);
    margin-bottom: 10px;
  }
  h1 { font-size: 1.85em; }
  h2 { font-size: 1.28em; margin-top: 2px; }
  h3 { font-size: 1.06em; }
  p, ul, ol, table, pre, blockquote, figure, details, hr {
    margin-bottom: 12px;
  }
  p:last-child, ul:last-child, ol:last-child, table:last-child, pre:last-child,
  blockquote:last-child, figure:last-child, details:last-child {
    margin-bottom: 0;
  }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.72em;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .lede {
    font-size: 1.04em;
    color: color-mix(in srgb, var(--text) 92%, white);
  }
  .hero-block {
    padding: 14px 16px;
    border: 1px solid var(--soft-line);
    border-radius: 16px;
    background: linear-gradient(180deg, var(--surface-raised), var(--surface));
    box-shadow: 0 10px 30px color-mix(in srgb, ${theme.divider} 24%, transparent);
  }
  .callout-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }
  .stat-card,
  .tip-box,
  details {
    border: 1px solid var(--soft-line);
    border-radius: 12px;
    background: var(--panel);
  }
  .stat-card {
    padding: 10px 12px;
  }
  .stat-card strong {
    display: block;
    font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
    margin-bottom: 4px;
  }
  .stat-card span,
  .mini-note,
  figcaption,
  summary {
    color: var(--muted);
  }
  .tip-box {
    padding: 10px 12px;
  }
  .check-list {
    padding-left: 1.2em;
  }
  ul, ol {
    padding-left: 1.2em;
  }
  li + li {
    margin-top: 0.28em;
  }
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
    background: color-mix(in srgb, var(--surface-raised) 78%, white);
  }
  th, td {
    padding: 9px 10px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--soft-line);
  }
  th {
    font-family: "Noto Sans JP", ui-sans-serif, system-ui, sans-serif;
    font-size: 0.82em;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: color-mix(in srgb, var(--text) 62%, white);
    background: color-mix(in srgb, var(--surface-alt) 82%, white);
  }
  tr:last-child td {
    border-bottom: none;
  }
  code, kbd {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.92em;
    border-radius: 7px;
  }
  code {
    padding: 0.15em 0.42em;
    background: color-mix(in srgb, ${theme.linkBackground} 32%, white);
    color: color-mix(in srgb, var(--accent) 68%, black);
  }
  kbd {
    padding: 0.18em 0.44em;
    border: 1px solid var(--soft-line);
    background: linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 84%, white), var(--surface-alt));
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7) inset;
  }
  pre {
    padding: 12px 14px;
    overflow-x: auto;
    border-radius: 14px;
    background: linear-gradient(180deg, #29231d, #171310);
    color: var(--code-text);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }
  pre code {
    padding: 0;
    background: transparent;
    color: inherit;
  }
  mark {
    padding: 0.08em 0.22em;
    background: rgba(255, 219, 122, 0.55);
    color: inherit;
    border-radius: 4px;
  }
  hr {
    border: none;
    border-top: 1px solid var(--line);
  }
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
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.65) inset;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }
  a[data-paper-id]::after {
    content: '↗';
    font-size: 0.82em;
    opacity: 0.72;
  }
  a[data-paper-id][data-open] {
    background: ${theme.linkText};
    border-color: ${theme.linkText};
    color: ${theme.surface};
    box-shadow: none;
  }
  a[data-paper-id][data-open]::after {
    content: '✓';
    opacity: 0.9;
  }
  a[data-paper-id][data-open]:hover {
    background: ${theme.linkText};
    transform: none;
    box-shadow: none;
  }
  a[data-paper-id]:hover {
    background: ${theme.linkBackgroundHover};
    transform: translateY(-1px);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.75) inset,
      0 4px 10px rgba(0, 0, 0, 0.08);
  }
  a[data-paper-id]:active {
    transform: translateY(0);
  }
  figure {
    margin: 12px 0;
  }
  img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    border-radius: 12px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    object-fit: cover;
  }
  figcaption {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--muted);
  }
  details {
    padding: 10px 12px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
    user-select: none;
  }
</style>
${injectedCss}
</head>
<body>
${content}
<script>${BOOTSTRAP_SCRIPT}</script>
</body>
</html>`;
}

export function isPaperContentEvent(data: unknown): data is PaperContentEvent {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (d.type === 'open') return typeof d.paperId === 'string';
  if (d.type === 'dragstart') return typeof d.paperId === 'string';
  if (d.type === 'resize') return typeof d.height === 'number';
  return false;
}
