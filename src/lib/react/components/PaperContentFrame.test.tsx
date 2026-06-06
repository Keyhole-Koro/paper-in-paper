import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Paper } from '../../core/types';
import { buildPaperMap } from '../../core/tree';
import { PaperCanvas } from '../PaperCanvas';

afterEach(cleanup);

function renderCanvas(content: string, loadImageUrl?: (fileId: string) => Promise<string>) {
  const papers: Paper[] = [
    {
      id: 'root',
      title: 'Root',
      description: 'root',
      hue: 36,
      content,
      parentId: null,
      childIds: [],
    },
  ];
  return render(<PaperCanvas paperMap={buildPaperMap(papers)} rootId="root" loadImageUrl={loadImageUrl} />);
}

// The content iframe renders via srcDoc. jsdom does not execute iframe srcDoc
// scripts, so we assert the marker + bridge are wired into the document rather
// than driving the postMessage round trip (that flow is covered by the
// handleLoadImage unit tests).
function rootSrcDoc(container: HTMLElement): string {
  const frame = container.querySelector('iframe');
  return frame?.getAttribute('srcdoc') ?? '';
}

// bodyContent returns the rendered content between <body> and the bridge
// <script>, i.e. the LLM-authored HTML only — not the bootstrap script which
// references data-file-id as a selector.
function bodyContent(srcDoc: string): string {
  const body = srcDoc.slice(srcDoc.indexOf('<body>'));
  return body.slice(0, body.indexOf('<script'));
}

describe('PaperContentFrame image markers', () => {
  it('embeds the data-file-id marker into the content iframe', () => {
    const { container } = renderCanvas(
      '<p>see <img data-file-id="file-1" alt="diagram" loading="lazy"></p>',
      vi.fn().mockResolvedValue('https://signed.example/file-1'),
    );
    // The marker survives into the rendered content body (not just the script).
    expect(bodyContent(rootSrcDoc(container))).toContain('data-file-id="file-1"');
  });

  it('wires the loadImage bridge so markers can request a URL', () => {
    const { container } = renderCanvas(
      '<p><img data-file-id="file-1"></p>',
      vi.fn().mockResolvedValue('https://signed.example/file-1'),
    );
    const srcDoc = rootSrcDoc(container);
    // The bootstrap script asks the host to load each marker.
    expect(srcDoc).toContain("type: 'loadImage'");
    expect(srcDoc).toContain('img[data-file-id]');
  });

  it('renders content with no markers and emits no <img> tag', () => {
    const { container } = renderCanvas('<p>plain text, no image</p>', vi.fn());
    const body = bodyContent(rootSrcDoc(container));
    expect(body).toContain('plain text, no image');
    // The bootstrap script references img[data-file-id] as a selector, so we
    // assert on the content body only, which carries no actual <img> element.
    expect(body).not.toContain('<img');
  });
});
