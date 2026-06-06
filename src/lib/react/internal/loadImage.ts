import type { LoadImageUrl } from '../context/LoadImageUrlContext';

// PostImageUrl posts a resolved image URL back into the content iframe. It is
// the seam that lets handleLoadImage stay free of any DOM/iframe reference, so
// the load flow is unit-testable.
export type PostImageUrl = (message: { type: 'setImageUrl'; fileId: string; url: string }) => void;

// handleLoadImage runs the load-image flow for one data-file-id marker: ask the
// host loader for a URL, then post it back so the iframe can set the <img src>.
// It is a no-op when no loader is wired, and a failed load is swallowed so a
// single missing image never breaks the page. Returns the in-flight promise so
// callers (and tests) can await completion; undefined when no loader ran.
export function handleLoadImage(
  loadImageUrl: LoadImageUrl | null | undefined,
  fileId: string,
  post: PostImageUrl,
): Promise<void> | undefined {
  if (!loadImageUrl) return undefined;
  return loadImageUrl(fileId)
    .then((url) => {
      post({ type: 'setImageUrl', fileId, url });
    })
    .catch(() => {
      // A failed load leaves the image blank; never break the page.
    });
}
