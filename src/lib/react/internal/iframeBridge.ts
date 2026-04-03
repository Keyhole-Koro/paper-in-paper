import type { PaperId } from '../../core/types';

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

export function buildSrcDoc(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #333; padding: 0; }
  a[data-paper-id] { color: #4a90e2; text-decoration: underline; cursor: pointer; }
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
