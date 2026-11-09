import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { PaperId } from '../../core/types';
import { useCanvasOptions } from '../context/CanvasOptionsContext';
import { useDragStore, useDragValue } from '../drag/dragContext';
import { useIframeBridge, type FrameContext } from '../hooks/useIframeBridge';
import {
  appendRelatedLinks,
  buildSrcDoc,
  createFrameToken,
  findImageMarkerIds,
  safeExternalHref,
  type PaperContentEvent,
} from '../internal/iframeBridge';
import { handleLoadImage } from '../internal/loadImage';
import { openPaperLink } from '../internal/openPaperLink';
import { getPaperTone, resolvePaperColorContext, type PaperColorContext } from '../internal/paperColors';
import { themeFromTone, type PaperContentTheme } from '../internal/contentTheme';
import { usePaperStoreApi, usePaperStoreSelector, useStoreValue } from '../store/storeContext';
import type { PaperStoreSnapshot } from '../store/createPaperStore';

export type { PaperContentTheme };

export interface PaperHtmlContentProps {
  /** The paper this HTML belongs to: links open relative to it and image loads are scoped to it. */
  nodeId: PaperId;
  html: string;
  /** Accessible name of the frame. Defaults to the paper's title. */
  title?: string;
  /**
   * Papers to append as links when the HTML does not link to them. Defaults to the paper's
   * children, so every child stays reachable; pass `false` to append nothing.
   */
  relatedLinks?: ReadonlyArray<{ id: PaperId; title: string }> | false;
  /** Colours for the default styles. Defaults to the paper's own tone. */
  theme?: Partial<PaperContentTheme>;
  /** CSS added after the base styles. */
  overrideCss?: string;
  /** Replaces the built-in content styles entirely. */
  baseCss?: string;
  /** Base font size in px. Defaults to `config.content.fontSize`. */
  fontSize?: number;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
}

const EMPTY_IDS: readonly PaperId[] = [];
const EMPTY_CHILDREN: ReadonlyArray<{ id: PaperId; title: string }> = [];

function sameChildren(
  a: ReadonlyArray<{ id: PaperId; title: string }>,
  b: ReadonlyArray<{ id: PaperId; title: string }>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i].id !== b[i].id || a[i].title !== b[i].title) return false;
  return true;
}

/** "hue|depth|saturation" of a paper's colour context, as a primitive selectors can return. */
function colorKeyOf(snapshot: PaperStoreSnapshot, nodeId: PaperId): string {
  const lineage = [];
  const seen = new Set<PaperId>();
  let id: PaperId | null = nodeId;
  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const paper = snapshot.state.paperMap.get(id);
    if (!paper) break;
    lineage.push(paper);
    id = paper.parentId;
  }
  let color: PaperColorContext | null = null;
  for (let i = lineage.length - 1; i >= 0; i -= 1) {
    color = resolvePaperColorContext(lineage[i].hue, color, lineage[i].saturationScale);
  }
  const resolved = color ?? resolvePaperColorContext(undefined, null);
  return `${resolved.hue}|${resolved.depth}|${resolved.saturationScale ?? ''}|${snapshot.rootId === nodeId ? 'root' : ''}`;
}

/**
 * Sandboxed HTML content for a paper. Use it to embed HTML inside React content; papers whose
 * `content` is a string use it automatically. Must render inside a PaperCanvas.
 *
 * The frame runs with `sandbox="allow-scripts"` and a content security policy that only lets
 * the canvas's own bootstrap script run (by nonce): scripts in the HTML do not execute. The
 * bootstrap talks to the canvas over a private MessageChannel opened with a per-document
 * secret. Content that navigates its frame elsewhere is replaced by `labels.contentBlocked`.
 */
export function PaperHtmlContent({
  nodeId,
  html,
  title,
  relatedLinks,
  theme,
  overrideCss,
  baseCss,
  fontSize,
  className,
  style,
  'data-testid': testId,
}: PaperHtmlContentProps) {
  const store = usePaperStoreApi();
  const dragStore = useDragStore();
  const { labels, colorScheme, draggable, getCallbacks } = useCanvasOptions();
  const isDragging = useDragValue((drag) => drag.session !== null);
  const paperTitle = useStoreValue((snapshot) => snapshot.state.paperMap.get(nodeId)?.title ?? '');
  const openIds = useStoreValue((snapshot) => snapshot.state.expansionMap.get(nodeId)?.openChildIds ?? EMPTY_IDS);
  const configFontSize = useStoreValue((snapshot) => snapshot.config.content.fontSize);
  const colorKey = useStoreValue((snapshot) => colorKeyOf(snapshot, nodeId));
  const selectChildren = useCallback((snapshot: PaperStoreSnapshot) => {
    const paper = snapshot.state.paperMap.get(nodeId);
    if (!paper || paper.childIds.length === 0) return EMPTY_CHILDREN;
    return paper.childIds.map((id) => ({ id, title: snapshot.state.paperMap.get(id)?.title ?? id }));
  }, [nodeId]);
  const children = usePaperStoreSelector(selectChildren, sameChildren);
  const [height, setHeight] = useState(60);
  // The content whose frame navigated away. New content gets a new chance.
  const [blockedHtml, setBlockedHtml] = useState<string | null>(null);
  // Identifies drags this frame started, so only it moves, drops or cancels them.
  const [dragOrigin] = useState(() => ({}));

  const resolvedTheme = useMemo((): PaperContentTheme => {
    const [hue, depth, saturation, root] = colorKey.split('|');
    const tone = getPaperTone(
      { hue: Number(hue), depth: Number(depth), saturationScale: saturation === '' ? undefined : Number(saturation) },
      { isRoot: root === 'root', scheme: colorScheme },
    );
    return { ...themeFromTone(tone), ...theme };
  }, [colorKey, colorScheme, theme]);

  const finalHtml = useMemo(() => {
    const related = relatedLinks === false ? EMPTY_CHILDREN : relatedLinks ?? children;
    return appendRelatedLinks(html, related, labels.relatedLinks);
  }, [html, relatedLinks, children, labels.relatedLinks]);
  const allowedFileIds = useMemo(() => findImageMarkerIds(html), [html]);

  // Every document gets its own nonce and secret: a value one document leaks is worthless to
  // the next.
  const frameDoc = useMemo(() => {
    const secret = createFrameToken();
    const srcDoc = buildSrcDoc({
      html: finalHtml,
      theme: resolvedTheme,
      fontSize: fontSize ?? configFontSize,
      nonce: createFrameToken(),
      secret,
      colorScheme,
      overrideCss,
      baseCss,
    });
    return { secret, srcDoc };
  }, [finalHtml, resolvedTheme, fontSize, configFontSize, colorScheme, overrideCss, baseCss]);

  const blocked = blockedHtml === finalHtml;

  // A drag that started in this frame cannot outlive it.
  useEffect(() => () => dragStore.cancel(dragOrigin), [dragStore, dragOrigin]);

  const toViewport = (frame: HTMLIFrameElement, x: number, y: number) => {
    // The frame reports coordinates in its own viewport.
    const box = frame.getBoundingClientRect();
    return { x: box.left + x, y: box.top + y };
  };

  const onEvent = (event: PaperContentEvent, { frame, reply }: FrameContext) => {
    switch (event.type) {
      case 'open':
        openPaperLink(store, nodeId, event.paperId);
        break;
      case 'resize':
        setHeight((previous) => (Math.abs(previous - event.height) < 1 ? previous : event.height));
        break;
      case 'dragstart': {
        if (!draggable) break;
        const child = store.getState().paperMap.get(event.paperId);
        if (!child || child.parentId !== nodeId) break;
        dragStore.startDrag(
          { draggedPaperId: child.id, sourceParentId: nodeId, mode: 'content-link', draggedTitle: child.title },
          toViewport(frame, event.clientX, event.clientY),
          dragOrigin,
        );
        break;
      }
      // While the button is down the browser keeps the gesture in this frame, so the frame
      // forwards it.
      case 'dragmove':
        dragStore.moveTo(toViewport(frame, event.clientX, event.clientY), dragOrigin);
        break;
      case 'dragend':
        dragStore.release(toViewport(frame, event.clientX, event.clientY), dragOrigin);
        break;
      case 'dragcancel':
        dragStore.cancel(dragOrigin);
        break;
      case 'loadImage':
        void handleLoadImage(getCallbacks().loadImageUrl, event.fileId, { nodeId, allowedFileIds }, reply);
        break;
      case 'openExternal': {
        const href = safeExternalHref(event.href);
        if (!href) break;
        const open = getCallbacks().onOpenExternalLink;
        if (open) open(href);
        else window.open(href, '_blank', 'noopener,noreferrer');
        break;
      }
    }
  };

  const onForeignDocument = () => {
    dragStore.cancel(dragOrigin);
    setBlockedHtml(finalHtml);
  };

  const ref = useIframeBridge({ secret: frameDoc.secret, openIds, onEvent, onForeignDocument });

  if (blocked) {
    return (
      <div
        role="note"
        className={className}
        data-paper-content-blocked={nodeId}
        data-testid={testId}
        style={{
          padding: '8px 2px',
          fontSize: 13,
          lineHeight: 1.5,
          color: resolvedTheme.mutedText,
          ...style,
        }}
      >
        {labels.contentBlocked}
      </div>
    );
  }

  return (
    <iframe
      ref={ref}
      srcDoc={frameDoc.srcDoc}
      title={title ?? paperTitle}
      sandbox="allow-scripts"
      className={className}
      data-paper-content-id={nodeId}
      data-testid={testId}
      style={{
        width: '100%',
        height,
        border: 'none',
        display: 'block',
        colorScheme,
        background: 'transparent',
        pointerEvents: isDragging ? 'none' : 'auto',
        ...style,
      }}
    />
  );
}
