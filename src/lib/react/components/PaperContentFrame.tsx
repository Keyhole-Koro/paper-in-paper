import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentNode, PaperContent, PaperId } from '../../core/types';
import type { PaperContentEvent } from '../internal/iframeBridge';
import { useIframeBridge } from '../hooks/useIframeBridge';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import { PaperContentNodes } from './PaperContentNodes';

export interface PaperContentTheme {
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

  // ContentNode[] path
  if (Array.isArray(content)) {
    return (
      <PaperContentStructured
        nodeId={nodeId}
        nodes={content as ContentNode[]}
        theme={theme}
        onOpen={(paperId) => {
          dispatch({ type: 'OPEN_NODE', parentId: nodeId, childId: paperId });
          dispatch({ type: 'FOCUS_NODE', nodeId: paperId });
        }}
      />
    );
  }

  // ReactNode path
  if (typeof content !== 'string') {
    return <PaperContentReact nodeId={nodeId} content={content} theme={theme} />;
  }

  // HTML string path — append unmentioned children as "Related" links
  let finalContent = content;
  const paper = state.paperMap.get(nodeId);
  if (paper) {
    const unmentioned = paper.childIds.filter((id) => !finalContent.includes(`data-paper-id="${id}"`));
    if (unmentioned.length > 0) {
      const links = unmentioned.map((id) => {
        const childPaper = state.paperMap.get(id);
        const title = childPaper ? childPaper.title : id;
        return `<a data-paper-id="${id}">${title}</a>`;
      });
      finalContent += `<hr/><div style="margin-top: 16px;"><p class="eyebrow">Related</p><p style="display: flex; flex-wrap: wrap; gap: 8px;">${links.join('')}</p></div>`;
    }
  }

  const plainText = finalContent.replace(/<[^>]+>/g, '');
  const fontSize = calcContentFontSize(plainText.length);

  const { iframeRef, srcDoc } = useIframeBridge({ content: finalContent, theme, fontSize, onEvent: handleEvent });

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

// --- ContentNode[] renderer ---

interface PaperContentStructuredProps {
  nodeId: PaperId;
  nodes: ContentNode[];
  theme: PaperContentTheme;
  onOpen: (paperId: PaperId) => void;
}

function PaperContentStructured({ nodeId, nodes, theme, onOpen }: PaperContentStructuredProps) {
  const { dispatch } = usePaperStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function reportHeight() {
      const nextEl = containerRef.current;
      if (!nextEl) return;
      const nextHeight = nextEl.scrollHeight;
      if (lastHeightRef.current === nextHeight) return;
      lastHeightRef.current = nextHeight;
      dispatch({ type: 'REPORT_CONTENT_HEIGHT', nodeId, height: nextHeight });
    }
    const observer = new ResizeObserver(reportHeight);
    observer.observe(el);
    reportHeight();
    return () => observer.disconnect();
  }, [dispatch, nodeId]);

  return (
    <div ref={containerRef}>
      <PaperContentNodes nodes={nodes} theme={theme} onOpen={onOpen} />
    </div>
  );
}

// --- ReactNode renderer ---

interface PaperContentReactProps {
  nodeId: PaperId;
  content: Exclude<PaperContent, string | ContentNode[]>;
  theme: PaperContentTheme;
}

function PaperContentReact({ nodeId, content, theme }: PaperContentReactProps) {
  const { dispatch } = usePaperStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function reportHeight() {
      const nextEl = containerRef.current;
      if (!nextEl) return;
      const nextHeight = nextEl.scrollHeight;
      if (lastHeightRef.current === nextHeight) return;
      lastHeightRef.current = nextHeight;
      dispatch({ type: 'REPORT_CONTENT_HEIGHT', nodeId, height: nextHeight });
    }

    const observer = new ResizeObserver(reportHeight);
    observer.observe(el);
    reportHeight();
    return () => observer.disconnect();
  }, [dispatch, nodeId, content]);

  const handlePaperOpen = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    if (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') return;
    const target = (e.target as Element).closest('[data-paper-id]');
    if (!target) return;
    const paperId = target.getAttribute('data-paper-id');
    if (!paperId) return;
    e.preventDefault();
    dispatch({ type: 'OPEN_NODE', parentId: nodeId, childId: paperId });
    dispatch({ type: 'FOCUS_NODE', nodeId: paperId });
  }, [dispatch, nodeId]);

  return (
    <div
      ref={containerRef}
      onClick={handlePaperOpen}
      onKeyDown={handlePaperOpen}
      style={{
        ['--surface' as string]: theme.surface,
        ['--surface-alt' as string]: theme.surfaceAlt,
        ['--surface-raised' as string]: theme.surfaceRaised,
        ['--text' as string]: theme.text,
        ['--muted' as string]: theme.mutedText,
        ['--line' as string]: theme.divider,
        ['--link-bg' as string]: theme.linkBackground,
        ['--link-border' as string]: theme.linkBorder,
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
