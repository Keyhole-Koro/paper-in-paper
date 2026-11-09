import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { isContentNode } from '../../core/contentMass';
import type { ContentNode, Paper, PaperId } from '../../core/types';
import { useCanvasOptions } from '../context/CanvasOptionsContext';
import { openPaperLink } from '../internal/openPaperLink';
import type { PaperTone } from '../internal/paperColors';
import { usePaperStoreApi } from '../store/storeContext';
import { PaperContentNodes } from './PaperContentNodes';
import { PaperHtmlContent } from './PaperHtmlContent';
import { themeFromTone, type PaperContentTheme } from '../internal/contentTheme';

export type { PaperContentTheme };

interface PaperContentFrameProps {
  nodeId: PaperId;
  paper: Paper;
  tone: PaperTone;
}

function isContentNodeList(content: unknown): content is ContentNode[] {
  return Array.isArray(content) && content.every(isContentNode);
}

/** Renders a paper's content in the form it comes in: HTML string, ContentNode[] or React. */
export function PaperContentFrame({ nodeId, paper, tone }: PaperContentFrameProps) {
  const store = usePaperStoreApi();
  const { overrideCss } = useCanvasOptions();
  const content = paper.content;
  const theme = themeFromTone(tone);

  if (typeof content === 'string') {
    return (
      <PaperHtmlContent
        nodeId={nodeId}
        html={content}
        overrideCss={paper.overrideCss ?? overrideCss}
      />
    );
  }

  if (isContentNodeList(content)) {
    return (
      <PaperContentNodes
        nodes={content}
        theme={theme}
        onOpen={(paperId) => openPaperLink(store, nodeId, paperId)}
      />
    );
  }

  return <PaperContentReact nodeId={nodeId} content={content} theme={theme} />;
}

interface PaperContentReactProps {
  nodeId: PaperId;
  content: ReactNode;
  theme: PaperContentTheme;
}

/**
 * React content. Elements with `data-paper-id` open (or reveal) that paper on click, Enter or
 * Space; the CSS variables match the ones HTML content gets.
 */
function PaperContentReact({ nodeId, content, theme }: PaperContentReactProps) {
  const store = usePaperStoreApi();
  const { colorScheme } = useCanvasOptions();
  const mix = colorScheme === 'dark' ? 'black' : 'white';

  const follow = (event: MouseEvent | KeyboardEvent) => {
    const target = (event.target as Element | null)?.closest?.('[data-paper-id]');
    const paperId = target?.getAttribute('data-paper-id');
    if (!paperId) return;
    event.preventDefault();
    openPaperLink(store, nodeId, paperId);
  };

  return (
    <div
      onClick={follow}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') follow(event);
      }}
      style={{
        ['--surface' as string]: theme.surface,
        ['--surface-alt' as string]: theme.surfaceAlt,
        ['--surface-raised' as string]: theme.surfaceRaised,
        ['--text' as string]: theme.text,
        ['--muted' as string]: theme.mutedText,
        ['--line' as string]: theme.divider,
        ['--link-bg' as string]: theme.linkBackground,
        ['--link-border' as string]: theme.linkBorder,
        ['--soft-line' as string]: `color-mix(in srgb, ${theme.divider} 55%, ${mix})`,
        ['--panel' as string]: `color-mix(in srgb, ${theme.surfaceRaised} 88%, ${mix})`,
        ['--quote' as string]: `color-mix(in srgb, ${theme.linkBackground} 45%, ${mix})`,
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
