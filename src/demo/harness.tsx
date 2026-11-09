/**
 * A bare canvas for the browser tests (e2e/harness.spec.ts). The test sets
 * `window.__PIP_FIXTURE__` before the page loads; `?strict=0` renders without StrictMode, whose
 * double mounting can hide bugs that only show up in production.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PaperCanvas, buildPaperMap, type PaperCanvasHandle, type PaperCanvasLabels } from '../lib';

export interface HarnessPaper {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  childIds: string[];
}

export interface HarnessFixture {
  papers: HarnessPaper[];
  /** Open children per paper. */
  open?: Record<string, string[]>;
  labels?: Partial<PaperCanvasLabels>;
}

declare global {
  interface Window {
    __PIP_FIXTURE__?: HarnessFixture;
    /** The canvas handle, for tests to read state. */
    __pip?: PaperCanvasHandle | null;
    /** External links the canvas handed out. */
    __pipExternal?: string[];
  }
}

const fixture: HarnessFixture = window.__PIP_FIXTURE__ ?? {
  papers: [{ id: 'root', title: 'Harness', content: '<p>Set window.__PIP_FIXTURE__.</p>', parentId: null, childIds: [] }],
};
window.__pipExternal = [];

const paperMap = buildPaperMap(fixture.papers.map((paper) => ({ ...paper, description: '' })));
const expansionMap = new Map(Object.entries(fixture.open ?? {}).map(([id, openChildIds]) => [id, { openChildIds }]));

const canvas = (
  <div style={{ position: 'fixed', inset: 0 }}>
    <PaperCanvas
      ref={(handle) => {
        window.__pip = handle;
      }}
      paperMap={paperMap}
      defaultOpenState={{ expansionMap }}
      labels={fixture.labels}
      onOpenExternalLink={(href) => window.__pipExternal!.push(href)}
    />
  </div>
);

const strict = new URLSearchParams(window.location.search).get('strict') !== '0';
createRoot(document.getElementById('root')!).render(strict ? <StrictMode>{canvas}</StrictMode> : canvas);
