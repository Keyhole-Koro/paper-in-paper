import { memo } from 'react';
import type { PaperId } from '../../core/types';
import { getIndexLabelFontSize, TAB_THICK, type IndexLabelNode } from '../internal/indexLabels';
import { getPaperTone, type PaperColorScheme } from '../internal/paperColors';

interface IndexLabelProps {
  node: IndexLabelNode;
  canvasHeight: number;
  colorScheme: PaperColorScheme;
  onClick: (nodeId: PaperId) => void;
}

/** A tab on the canvas's left edge for an indexed paper; clicking it brings the paper back. */
export const IndexLabel = memo(function IndexLabel({ node, canvasHeight, colorScheme, onClick }: IndexLabelProps) {
  const tone = getPaperTone(node.color, { scheme: colorScheme });
  const top = Math.max(0, Math.min(node.centerY - node.extent / 2, canvasHeight - node.extent));
  return (
    <button
      type="button"
      title={node.title}
      data-index-label={node.id}
      onClick={() => onClick(node.id)}
      style={{
        position: 'absolute',
        zIndex: 50,
        left: 0,
        top,
        width: TAB_THICK,
        height: node.extent,
        background: tone.headerBackground,
        color: tone.title,
        borderStyle: 'solid',
        borderWidth: 1,
        borderLeftWidth: 0,
        borderColor: tone.border,
        borderRadius: `0 ${Math.floor(TAB_THICK / 2)}px ${Math.floor(TAB_THICK / 2)}px 0`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        font: 'inherit',
        fontSize: getIndexLabelFontSize(node.title),
        fontWeight: 600,
        letterSpacing: '0.03em',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        writingMode: 'vertical-rl',
        padding: '8px 0',
      }}
    >
      {node.title}
    </button>
  );
});
