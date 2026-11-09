import type { PaperId } from '../../core/types';
import type { LoadImageUrl } from '../context/CanvasOptionsContext';

// PostImageUrl posts a resolved image URL back into the content iframe. It is
// the seam that lets handleLoadImage stay free of any DOM/iframe reference, so
// the load flow is unit-testable.
export type PostImageUrl = (message: { type: 'setImageUrl'; fileId: string; url: string }) => void;

/**
 * Runs the load-image flow for one `data-file-id` marker: ask the host loader for a URL, then
 * post it back so the iframe can set the `<img src>`. A no-op without a loader, and for file ids
 * the paper's content does not contain (a script could otherwise ask for any file). A failed
 * load is swallowed so one missing image never breaks the page. Returns the in-flight promise
 * so callers (and tests) can await it; undefined when nothing was loaded.
 */
export function handleLoadImage(
  loadImageUrl: LoadImageUrl | null | undefined,
  fileId: string,
  context: { nodeId: PaperId; allowedFileIds: ReadonlySet<string> },
  post: PostImageUrl,
): Promise<void> | undefined {
  if (!loadImageUrl || !context.allowedFileIds.has(fileId)) return undefined;
  let pending: Promise<string>;
  try {
    pending = Promise.resolve(loadImageUrl(fileId, { nodeId: context.nodeId }));
  } catch {
    return undefined;
  }
  return pending
    .then((url) => {
      if (typeof url === 'string' && url) post({ type: 'setImageUrl', fileId, url });
    })
    .catch(() => {
      // A failed load leaves the image blank; never break the page.
    });
}
