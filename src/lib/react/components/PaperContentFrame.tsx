import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaperContent, PaperId } from '../../core/types';
import type { PaperContentEvent } from '../internal/iframeBridge';
import { useIframeBridge } from '../hooks/useIframeBridge';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';

interface PaperContentTheme {
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  text: string;
  mutedText: string;
  divider: string;
  linkBackground: string;
  linkBackgroundHover: string;
  linkBorder: string;
  linkText: string;
}

interface PaperContentFrameProps {
  nodeId: PaperId;
  content: PaperContent;
  theme: PaperContentTheme;
}

function calcContentFontSize(charCount: number): number {
  const MIN = 11, MAX = 16;
  if (charCount === 0) return MIN;
  return Math.min(MAX, Math.max(MIN, MIN + 2 * Math.log10(charCount)));
}

export function PaperContentFrame({ nodeId, content, theme }: PaperContentFrameProps) {
  const { dispatch, state } = usePaperStore();
  const { startDrag, isDragging } = useDrag();
  const [height, setHeight] = useState(60);

  const handleEvent = useCallback(
    (event: PaperContentEvent) => {
      if (event.type === 'open') {
        dispatch({ type: 'OPEN_NODE', parentId: nodeId, childId: event.paperId });
        dispatch({ type: 'FOCUS_NODE', nodeId: event.paperId });
      } else if (event.type === 'resize') {
        setHeight(event.height);
        dispatch({ type: 'REPORT_CONTENT_HEIGHT', nodeId, height: event.height });
      } else if (event.type === 'dragstart') {
        const paper = state.paperMap.get(event.paperId);
        if (!paper) return;
        startDrag(
          { draggedPaperId: event.paperId, sourceParentId: nodeId, mode: 'content-link', draggedTitle: paper.title },
          { x: event.clientX, y: event.clientY },
        );
      }
    },
    [nodeId, dispatch, startDrag, state.paperMap],
  );

  if (typeof content !== 'string') {
    return <PaperContentReact nodeId={nodeId} content={content} theme={theme} />;
  }

  const plainText = content.replace(/<[^>]+>/g, '');
  const fontSize = calcContentFontSize(plainText.length);

  const { iframeRef, srcDoc } = useIframeBridge({ content, theme, fontSize, onEvent: handleEvent });

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      style={{
        width: '100%',
        height,
        border: 'none',
        display: 'block',
        pointerEvents: isDragging ? 'none' : 'auto',
      }}
      sandbox="allow-scripts"
      title={`paper-content-${nodeId}`}
    />
  );
}

interface PaperContentReactProps {
  nodeId: PaperId;
  content: Exclude<PaperContent, string>;
  theme: PaperContentTheme;
}

function PaperContentReact({ nodeId, content, theme }: PaperContentReactProps) {
  const { dispatch } = usePaperStore();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function reportHeight() {
      const nextEl = containerRef.current;
      if (!nextEl) return;
      dispatch({ type: 'REPORT_CONTENT_HEIGHT', nodeId, height: nextEl.scrollHeight });
    }

    const observer = new ResizeObserver(reportHeight);
    observer.observe(el);
    reportHeight();
    return () => observer.disconnect();
  }, [dispatch, nodeId, content]);

  return (
    <div
      ref={containerRef}
      style={{
        ['--surface' as string]: theme.surface,
        ['--surface-alt' as string]: theme.surfaceAlt,
        ['--surface-raised' as string]: theme.surfaceRaised,
        ['--text' as string]: theme.text,
        ['--muted' as string]: theme.mutedText,
        ['--line' as string]: theme.divider,
        ['--soft-line' as string]: `color-mix(in srgb, ${theme.divider} 55%, white)`,
        ['--panel' as string]: `color-mix(in srgb, ${theme.surfaceRaised} 88%, white)`,
        ['--quote' as string]: `color-mix(in srgb, ${theme.linkBackground} 45%, white)`,
        ['--accent' as string]: theme.linkText,
        color: theme.text,
        display: 'grid',
        gap: 12,
        fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
        lineHeight: 1.7,
      }}
    >
      {content}
    </div>
  );
}
