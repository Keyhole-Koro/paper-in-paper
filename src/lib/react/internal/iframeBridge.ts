import type { PaperId } from '../../core/types';

interface IframeTheme {
  linkBackground: string;
  linkBackgroundHover: string;
  linkBorder: string;
  linkText: string;
}

export type PaperContentEvent =
  | { type: 'open'; paperId: PaperId }
  | { type: 'dragstart'; paperId: PaperId; clientX: number; clientY: number }
  | { type: 'resize'; height: number };

const BOOTSTRAP_SCRIPT = `
(function () {
  function notifyHeight() {
    var h = document.documentElement.scrollHeight;
    parent.postMessage({ type: 'resize', height: h }, '*');
  }

  var observer = new ResizeObserver(notifyHeight);
  observer.observe(document.body);
  notifyHeight();

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-paper-id]');
    if (!el) return;
    e.preventDefault();
    parent.postMessage({ type: 'open', paperId: el.getAttribute('data-paper-id') }, '*');
  });

  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('[data-paper-id]');
    if (!el) return;
    parent.postMessage({
      type: 'dragstart',
      paperId: el.getAttribute('data-paper-id'),
      clientX: e.clientX,
      clientY: e.clientY,
    }, '*');
  });
})();
`;

export function buildSrcDoc(content: string, theme: IframeTheme): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #333; padding: 0; }
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
    color: #6a6a78;
  }
  p { margin-bottom: 10px; }
  p:last-child { margin-bottom: 0; }
</style>
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
