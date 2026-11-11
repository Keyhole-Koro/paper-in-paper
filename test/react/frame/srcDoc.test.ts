import { describe, expect, it } from 'vitest';
import BOOTSTRAP_SOURCE from '../../../src/lib/react/internal/frame/bootstrap.js?raw';
import { contentSecurityPolicy, createFrameToken } from '../../../src/lib/react/internal/frame/srcDoc';
import { buildTestDoc as doc } from '../../helpers/frames';

describe('content security policy', () => {
  const policy = contentSecurityPolicy('abc');
  const directive = (name: string) => policy.split('; ').find((d) => d.startsWith(`${name} `));

  it('runs only the nonce-bearing bootstrap', () => {
    expect(directive('script-src')).toBe("script-src 'nonce-abc'");
    expect(policy).not.toContain('unsafe-eval');
  });

  it('allows no requests a stylesheet or script could chain', () => {
    expect(directive('default-src')).toBe("default-src 'none'");
    expect(directive('style-src')).toBe("style-src 'unsafe-inline'");
    expect(directive('font-src')).toBe('font-src data:');
    expect(directive('connect-src')).toBe("connect-src 'none'");
    expect(directive('form-action')).toBe("form-action 'none'");
    expect(directive('base-uri')).toBe("base-uri 'none'");
    expect(directive('frame-src')).toBe("frame-src 'none'");
  });
});

describe('buildSrcDoc', () => {
  it('puts the policy and the bootstrap (with its nonce and secret) in the head, before any content', () => {
    const built = doc();
    const [head, body] = built.split('<body>');
    expect(head).toContain(`<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy('NONCE')}" />`);
    expect(head).toContain('<script nonce="NONCE">');
    expect(head).toContain("const SECRET = 'SECRET1'");
    expect(head.indexOf('Content-Security-Policy')).toBeLessThan(head.indexOf('<script'));
    expect(head).toContain('<meta name="referrer" content="no-referrer" />');
    expect(body).toContain('<p>hello</p>');
    expect(built).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('never lets a secret break out of its string', () => {
    expect(doc({ secret: "x';alert(1);'" })).toContain("const SECRET = 'xalert1'");
  });

  it('applies the font size and colour scheme', () => {
    expect(doc({ fontSize: 15 })).toContain('font-size: 15px');
    expect(doc({ colorScheme: 'dark' })).toContain('color-scheme: dark');
  });

  it('keeps override CSS inside its style element and lets baseCss replace the built-in styles', () => {
    expect(doc({ overrideCss: 'p{}</style><script>alert(1)</script>' })).not.toContain('</style><script>alert(1)');
    const custom = doc({ baseCss: 'body { color: red; }' });
    expect(custom).toContain('body { color: red; }');
    expect(custom).not.toContain('a[data-paper-id] {');
    expect(custom).toContain('display: flow-root');
  });

  it('ships the bootstrap as written: one secret placeholder, nothing that ends its script element', () => {
    expect(BOOTSTRAP_SOURCE.match(/%%PIP_SECRET%%/g)).toHaveLength(1);
    expect(BOOTSTRAP_SOURCE).not.toMatch(/<\/script/i);
    expect(doc()).toContain(BOOTSTRAP_SOURCE.replace('%%PIP_SECRET%%', 'SECRET1'));
  });

  it('removes http-equiv pragmas from the content', () => {
    const built = doc({ html: '<meta http-equiv="refresh" content="0;url=https://evil.test/"><p>x</p>' });
    expect(built.split('<body>')[1]).not.toMatch(/http-equiv/i);
  });
});

describe('createFrameToken', () => {
  it('makes URL-safe random tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => createFrameToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });
});
