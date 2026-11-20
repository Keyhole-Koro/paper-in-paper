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

/** Where a `<meta` start tag can begin: the tag name ends at whitespace, `/`, `>` or the end. */
const META_START = /<meta(?=[\t\n\f\r />]|$)/gi;
const WHITESPACE = '\t\n\f\r ';
/** Characters stripHttpEquiv may read per character of content, beyond which it gives up checking. */
const WORK_PER_CHAR = 8;
const BASE_WORK = 100_000;

/**
 * Reads the attributes of the start tag whose name ends at `from`, as the HTML tokenizer does
 * (names end at whitespace, `/`, `>` or `=`; values are quoted or unquoted). Returns where the
 * tag ends and whether it has an `http-equiv` attribute. A tag that runs to the end of the text
 * counts as ending there: in the frame document it would close on the markup that follows.
 */
function scanTag(html: string, from: number): { end: number; httpEquiv: boolean } {
  let i = from;
  let httpEquiv = false;
  const n = html.length;
  while (i < n) {
    const c = html[i];
    if (WHITESPACE.includes(c) || c === '/') {
      i += 1;
      continue;
    }
    if (c === '>') return { end: i + 1, httpEquiv };
    // An attribute name: the first character may be '=', any other '=' ends it.
    const nameStart = i;
    i += 1;
    while (i < n && !WHITESPACE.includes(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i += 1;
    if (html.slice(nameStart, i).toLowerCase() === 'http-equiv') httpEquiv = true;
    while (i < n && WHITESPACE.includes(html[i])) i += 1;
    if (html[i] !== '=') continue;
    i += 1;
    while (i < n && WHITESPACE.includes(html[i])) i += 1;
    const quote = html[i];
    if (quote === '"' || quote === "'") {
      const close = html.indexOf(quote, i + 1);
      if (close === -1) return { end: n, httpEquiv };
      i = close + 1;
    } else {
      // Unquoted (or missing, when '>' follows): runs to whitespace or '>'.
      while (i < n && !WHITESPACE.includes(html[i]) && html[i] !== '>') i += 1;
    }
  }
  return { end: n, httpEquiv };
}

/** No `<meta` (in any case) is left after this, so no meta element can be parsed from it. */
function escapeEveryMeta(html: string): string {
  return html.replace(/<meta/gi, '&lt;meta');
}

/**
 * Removes `<meta http-equiv>` from content: `refresh` would navigate the frame away from the
 * canvas's document and policy. This only keeps ordinary content working; the canvas also
 * stops showing a frame whose document is not its own (see `createFrameConnection`).
 *
 * Every `<meta` in the text is checked on its own, wherever it is: one inside a comment or an
 * attribute value is not a tag, but text that looks like one is removed too. Removing a tag can
 * join the text around it into a new one, so this repeats until nothing changes. Text that would take
 * unreasonably long to check (thousands of unclosed or nested `<meta`) gets every `<meta`
 * escaped to `&lt;meta` instead, which leaves no meta element at all.
 */
export function stripHttpEquiv(html: string): string {
  let work = BASE_WORK + WORK_PER_CHAR * html.length;
  let current = html;
  for (;;) {
    work -= current.length;
    if (work < 0) return escapeEveryMeta(html);
    const kept: string[] = [];
    let cursor = 0;
    const metaStart = new RegExp(META_START.source, 'gi');
    for (let match = metaStart.exec(current); match !== null; match = metaStart.exec(current)) {
      const { end, httpEquiv } = scanTag(current, match.index + match[0].length);
      work -= end - match.index;
      if (work < 0) return escapeEveryMeta(html);
      if (httpEquiv) {
        kept.push(current.slice(cursor, match.index));
        cursor = end;
        metaStart.lastIndex = end;
      } else {
        // A `<meta` inside this one's attributes may be a tag of its own after all.
        metaStart.lastIndex = match.index + 1;
      }
    }
    if (cursor === 0) return current;
    kept.push(current.slice(cursor));
    current = kept.join('');
  }
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
