import { useCallback, useMemo, useRef, useState } from 'react';
import type { ContentNode, PaperContent, PaperId } from '../../core/types';
import type { PaperContentEvent } from '../internal/iframeBridge';
import { useIframeBridge } from '../hooks/useIframeBridge';
import { usePaperDispatch, usePaperStoreSelector } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import type { PaperContentHtmlMapEntry } from '../internal/paperContentHtml';
import { calcContentFontSize, deriveHtmlPresentation } from '../internal/paperContentHtml';
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
  overrideCss?: string;
}

const EMPTY_OPEN_IDS: PaperId[] = [];
const EMPTY_CHILD_TITLES = new Map<PaperId, string>();

function shallowEqualContentSelection(
  a: {
    nodeTitle: string;
    childTitles: Map<PaperId, string>;
    openIds: PaperId[];
  },
  b: {
    nodeTitle: string;
    childTitles: Map<PaperId, string>;
    openIds: PaperId[];
  },
) {
  if (a.nodeTitle !== b.nodeTitle) return false;
  if (a.openIds !== b.openIds) return false;
  if (a.childTitles.size !== b.childTitles.size) return false;
  for (const [id, title] of a.childTitles) {
    if (b.childTitles.get(id) !== title) return false;
  }
  return true;
}

export function PaperContentFrame({ nodeId, content, theme, overrideCss }: PaperContentFrameProps) {
  const dispatch = usePaperDispatch();
  const { startDrag, isDragging } = useDrag();
  const [height, setHeight] = useState(60);
  const lastHeightRef = useRef(60);
  const isStructured = Array.isArray(content);
  const isHtmlString = typeof content === 'string';
  const { nodeTitle, childTitles, openIds } = usePaperStoreSelector(({ state }) => {
    const paper = state.paperMap.get(nodeId);
    if (!paper) {
      return { nodeTitle: nodeId, childTitles: EMPTY_CHILD_TITLES, openIds: EMPTY_OPEN_IDS };
    }
    const childTitles = new Map<PaperId, string>();
    for (const childId of paper.childIds) {
      childTitles.set(childId, state.paperMap.get(childId)?.title ?? childId);
    }
    return {
      nodeTitle: paper.title,
      childTitles,
      openIds: state.expansionMap.get(nodeId)?.openChildIds ?? EMPTY_OPEN_IDS,
    };
  }, shallowEqualContentSelection);

  const htmlPresentation = useMemo(() => {
    if (!isHtmlString) {
      return { finalContent: '', fontSize: calcContentFontSize(0) };
    }
    const paperMap = new Map<PaperId, PaperContentHtmlMapEntry>();
    paperMap.set(nodeId, {
      title: nodeTitle,
      childIds: Array.from(childTitles.keys()),
    });
    for (const [childId, childTitle] of childTitles) {
      paperMap.set(childId, { title: childTitle, childIds: [] });
    }
    return deriveHtmlPresentation(content, nodeId, paperMap);
  }, [content, isHtmlString, nodeId, nodeTitle, childTitles]);

  const handleEvent = useCallback(
    (event: PaperContentEvent) => {
      if (event.type === 'open') {
        dispatch({ type: 'OPEN_NODE', parentId: nodeId, childId: event.paperId });
      } else if (event.type === 'resize') {
        if (Math.abs(lastHeightRef.current - event.height) < 8) return;
        lastHeightRef.current = event.height;
        setHeight(event.height);
        dispatch({ type: 'REPORT_CONTENT_HEIGHT', nodeId, height: event.height });
      } else if (event.type === 'dragstart') {
        const title = childTitles.get(event.paperId);
        if (!title) return;
        startDrag(
          { draggedPaperId: event.paperId, sourceParentId: nodeId, mode: 'content-link', draggedTitle: title },
          { x: event.clientX, y: event.clientY },
        );
      }
    },
    [nodeId, dispatch, startDrag, childTitles],
  );

  const { iframeRef, srcDoc } = useIframeBridge({
    content: htmlPresentation.finalContent,
    theme,
    fontSize: htmlPresentation.fontSize,
    overrideCss,
    openIds,
    onEvent: handleEvent,
  });

  // ContentNode[] path
  if (isStructured) {
    return (
      <PaperContentStructured
        nodeId={nodeId}
        nodes={content as ContentNode[]}
        theme={theme}
        onOpen={(paperId) => {
          dispatch({ type: 'OPEN_NODE', parentId: nodeId, childId: paperId });
        }}
      />
    );
  }

  // ReactNode path
  if (!isHtmlString) {
    return <PaperContentReact nodeId={nodeId} content={content} theme={theme} />;
  }

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

function PaperContentStructured({ nodes, theme, onOpen }: PaperContentStructuredProps) {
  return (
    <div>
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
  const dispatch = usePaperDispatch();
  const containerRef = useRef<HTMLDivElement>(null);

  const handlePaperOpen = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    if (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') return;
    const target = (e.target as Element).closest('[data-paper-id]');
    if (!target) return;
    const paperId = target.getAttribute('data-paper-id');
    if (!paperId) return;
    e.preventDefault();
    dispatch({ type: 'OPEN_NODE', parentId: nodeId, childId: paperId });
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
        fontFamily: 'inherit',
        lineHeight: 1.7,
      }}
    >
      {content}
    </div>
  );
}
