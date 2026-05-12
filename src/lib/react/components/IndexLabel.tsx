import type { PaperId } from '../../core/types';

export type IndexLabelNode = {
  id: PaperId;
  title: string;
  side: 'right';
  centerX: number;
  centerY: number;
};

interface IndexLabelProps {
  node: IndexLabelNode;
  canvasHeight: number;
  onClick: (nodeId: PaperId) => void;
}

const TAB_THICK = 28;
const TAB_LEN = 100;
const BORDER_COLOR = 'rgba(0,0,0,0.18)';

export function IndexLabel({ node, canvasHeight, onClick }: IndexLabelProps) {
  const { centerY } = node;
  const top = Math.max(0, Math.min(centerY - TAB_LEN / 2, canvasHeight - TAB_LEN));

  return (
    <button
      title={node.title}
      style={{
        position: 'absolute',
        zIndex: 50,
        background: 'rgba(248, 246, 240, 0.95)',
        color: '#333',
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: BORDER_COLOR,
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.03em',
        cursor: 'pointer',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        right: 0,
        top,
        width: TAB_THICK,
        height: TAB_LEN,
        borderRadius: `${Math.floor(TAB_THICK / 2)}px 0 0 ${Math.floor(TAB_THICK / 2)}px`,
        borderRightWidth: 0,
        writingMode: 'vertical-rl',
        padding: '8px 0',
      }}
      onClick={() => onClick(node.id)}
    >
      {node.title}
    </button>
  );
}
