import { describe, expect, it, vi } from 'vitest';
import { handleLoadImage } from './loadImage';
import { isPaperContentEvent } from './iframeBridge';

describe('isPaperContentEvent', () => {
  it('accepts a loadImage event with a file id', () => {
    expect(isPaperContentEvent({ type: 'loadImage', fileId: 'f1' })).toBe(true);
  });

  it('rejects a loadImage event missing the file id', () => {
    expect(isPaperContentEvent({ type: 'loadImage' })).toBe(false);
    expect(isPaperContentEvent({ type: 'loadImage', fileId: 123 })).toBe(false);
  });

  it('still accepts the existing open/resize/dragstart events', () => {
    expect(isPaperContentEvent({ type: 'open', paperId: 'p' })).toBe(true);
    expect(isPaperContentEvent({ type: 'resize', height: 10 })).toBe(true);
    expect(isPaperContentEvent({ type: 'dragstart', paperId: 'p', clientX: 1, clientY: 2 })).toBe(true);
  });

  it('rejects unknown or malformed messages', () => {
    expect(isPaperContentEvent({ type: 'setImageUrl', fileId: 'f', url: 'u' })).toBe(false);
    expect(isPaperContentEvent(null)).toBe(false);
    expect(isPaperContentEvent('nope')).toBe(false);
  });
});

describe('handleLoadImage', () => {
  it('loads the url and posts setImageUrl back with the same file id', async () => {
    const loader = vi.fn().mockResolvedValue('https://signed.example/f1');
    const post = vi.fn();

    await handleLoadImage(loader, 'f1', post);

    expect(loader).toHaveBeenCalledWith('f1');
    expect(post).toHaveBeenCalledWith({
      type: 'setImageUrl',
      fileId: 'f1',
      url: 'https://signed.example/f1',
    });
  });

  it('is a no-op when no loader is wired', () => {
    const post = vi.fn();
    const result = handleLoadImage(null, 'f1', post);
    expect(result).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  it('swallows loader failures and never posts', async () => {
    const loader = vi.fn().mockRejectedValue(new Error('forbidden'));
    const post = vi.fn();

    // Must resolve (not reject): a failed image never breaks the page.
    await expect(handleLoadImage(loader, 'f1', post)).resolves.toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });
});
