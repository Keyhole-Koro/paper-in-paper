import type { PaperId } from '../../../core/types';

/** What content HTML needs before it goes into a frame, and what the canvas reads out of it. */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const META_TAG = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>?/gi;
const QUOTED = /"[^"]*"|'[^']*'/g;

/**
 * Removes `<meta http-equiv>` from content: `refresh` would navigate the frame away from the
 * canvas's document and policy. This only keeps ordinary content working; the canvas also
 * stops showing a frame whose document is not its own (see `createFrameConnection`).
 */
export function stripHttpEquiv(html: string): string {
  return html.replace(META_TAG, (tag) => (/\bhttp-equiv\b/i.test(tag.replace(QUOTED, '')) ? '' : tag));
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
