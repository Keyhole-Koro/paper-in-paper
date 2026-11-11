import { describe, expect, it } from 'vitest';
import { isFrameHello, isPaperContentEvent } from '../../../src/lib/react/internal/frame/protocol';

describe('messages from frames', () => {
  it('accepts the known events and rejects malformed ones', () => {
    for (const good of [
      { type: 'open', paperId: 'a' },
      { type: 'dragstart', paperId: 'a', clientX: 1, clientY: 2 },
      { type: 'dragmove', clientX: 1, clientY: 2 },
      { type: 'dragend', clientX: 1, clientY: 2 },
      { type: 'dragcancel' },
      { type: 'resize', height: 10 },
      { type: 'loadImage', fileId: 'f' },
      { type: 'openExternal', href: 'https://x' },
      { type: 'pong', seq: 3 },
      { type: 'leaving' },
    ]) {
      expect(isPaperContentEvent(good)).toBe(true);
    }
    for (const bad of [null, 1, 'open', {}, { type: 'open' }, { type: 'resize', height: -1 }, { type: 'resize', height: Number.NaN },
      { type: 'dragstart', paperId: 'a' }, { type: 'dragmove', clientX: 1 }, { type: 'dragend', clientX: 'x', clientY: 1 },
      { type: 'loadImage' }, { type: 'pong' }, { type: 'nope' }]) {
      expect(isPaperContentEvent(bad)).toBe(false);
    }
  });

  it('recognises the hello', () => {
    expect(isFrameHello({ type: 'pip:hello', secret: 's' })).toBe(true);
    expect(isFrameHello({ type: 'pip:hello' })).toBe(false);
    expect(isFrameHello({ type: 'open', secret: 's' })).toBe(false);
    expect(isFrameHello(null)).toBe(false);
  });
});
