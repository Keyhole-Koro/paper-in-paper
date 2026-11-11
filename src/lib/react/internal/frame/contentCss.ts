import type { PaperContentTheme } from '../contentTheme';
import type { PaperColorScheme } from '../paperColors';

/** Font stack for content: system UI fonts with Japanese fallbacks, no network fonts. */
export const CONTENT_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';

/** Structure every frame needs regardless of styling: measurable height and wrapped content. */
export const FRAME_RESET_CSS = `
  html, body { margin: 0; }
  body { display: flow-root; overflow: hidden; overflow-wrap: anywhere; }
`;

/** The built-in content styles, coloured by the paper's theme. `baseCss` replaces them. */
export function defaultContentCss(theme: PaperContentTheme, fontSize: number, colorScheme: PaperColorScheme): string {
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
