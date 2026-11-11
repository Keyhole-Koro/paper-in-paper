import BOOTSTRAP_SOURCE from './bootstrap.js?raw';
import type { PaperContentTheme } from '../contentTheme';
import type { PaperColorScheme } from '../paperColors';
import { defaultContentCss, FRAME_RESET_CSS } from './contentCss';
import { escapeHtml, stripHttpEquiv } from './contentHtml';

/** Where buildSrcDoc writes the document's secret into the bootstrap. */
const SECRET_PLACEHOLDER = '%%PIP_SECRET%%';

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

function escapeInlineStyleText(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

export interface SrcDocOptions {
  /** Content HTML (already including any appended related links). */
  html: string;
  theme: PaperContentTheme;
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

/**
 * The document of a content frame: the policy and the bootstrap in <head>, before anything the
 * content brings, then the styles and the content.
 */
export function buildSrcDoc(options: SrcDocOptions): string {
  const colorScheme = options.colorScheme ?? 'light';
  const base = options.baseCss ?? defaultContentCss(options.theme, options.fontSize, colorScheme);
  const override = options.overrideCss
    ? `\n<style data-paper-override-css>\n${escapeInlineStyleText(options.overrideCss)}\n</style>`
    : '';
  // The secret lands inside a string literal: only URL-safe token characters may get there.
  const script = BOOTSTRAP_SOURCE.replace(SECRET_PLACEHOLDER, options.secret.replace(/[^A-Za-z0-9_-]/g, ''));
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
