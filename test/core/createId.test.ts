import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId, randomBytes } from '../../src/lib/core/createId';
import { createFrameToken } from '../../src/lib/react/internal/frame/srcDoc';

const realCrypto = globalThis.crypto;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9_-]{24}$/;

/** Web Crypto with getRandomValues only, as on plain-http pages (no randomUUID). */
const insecureCrypto = (fill?: number) => ({
  getRandomValues: vi.fn((array: Uint8Array) => (fill === undefined ? realCrypto.getRandomValues(array) : array.fill(fill))),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('randomBytes', () => {
  it('returns the requested number of bytes from getRandomValues', () => {
    const cryptoApi = insecureCrypto(7);
    vi.stubGlobal('crypto', cryptoApi);
    expect(Array.from(randomBytes(5))).toEqual([7, 7, 7, 7, 7]);
    expect(cryptoApi.getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('falls back to Math.random without Web Crypto', () => {
    vi.stubGlobal('crypto', undefined);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(Array.from(randomBytes(3))).toEqual([255, 255, 255]);
    expect(random).toHaveBeenCalledTimes(3);
  });
});

describe('createId', () => {
  it('uses crypto.randomUUID when there is one', () => {
    const cryptoApi = { ...insecureCrypto(), randomUUID: vi.fn(() => '11111111-2222-4333-8444-555555555555') };
    vi.stubGlobal('crypto', cryptoApi);
    expect(createId()).toBe('11111111-2222-4333-8444-555555555555');
    expect(cryptoApi.getRandomValues).not.toHaveBeenCalled();
  });

  it('makes a v4 UUID from getRandomValues on plain-http pages', () => {
    vi.stubGlobal('crypto', insecureCrypto(0xff));
    expect(createId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    vi.stubGlobal('crypto', insecureCrypto(0));
    expect(createId()).toBe('00000000-0000-4000-8000-000000000000');

    vi.stubGlobal('crypto', insecureCrypto());
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });

  it('still makes distinct v4 UUIDs without Web Crypto', () => {
    vi.stubGlobal('crypto', undefined);
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(UUID_V4);
  });
});

describe('createFrameToken', () => {
  it('encodes 18 random bytes as URL-safe base64', () => {
    vi.stubGlobal('crypto', insecureCrypto(0xff));
    expect(createFrameToken()).toBe('_'.repeat(24));
    vi.stubGlobal('crypto', insecureCrypto(0xfb));
    expect(createFrameToken()).toBe('-_v7'.repeat(6));
  });

  it('makes distinct tokens with and without Web Crypto', () => {
    for (const cryptoApi of [realCrypto, insecureCrypto(), undefined]) {
      vi.stubGlobal('crypto', cryptoApi);
      const tokens = new Set(Array.from({ length: 50 }, () => createFrameToken()));
      expect(tokens.size).toBe(50);
      for (const token of tokens) expect(token).toMatch(TOKEN);
    }
  });
});
