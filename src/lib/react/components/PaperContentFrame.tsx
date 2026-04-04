import { useCallback, useState } from 'react';
import type { PaperId } from '../../core/types';
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
  content: string;
  theme: PaperContentTheme;
}

function calcContentFontSize(charCount: number): number {
  const MIN = 11, MAX = 16;
  if (charCount === 0) return MIN;
  return Math.min(MAX, Math.max(MIN, MIN + 2 * Math.log10(charCount)));
}

export function PaperContentFrame({ nodeId, content, theme }: PaperContentFrameProps) {
  const { dispatch, state } = usePaperStore();
  const { startDrag } = useDrag();
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
      }}
      sandbox="allow-scripts"
      title={`paper-content-${nodeId}`}
    />
  );
}
