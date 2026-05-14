import type { PaperId } from '../../core/types';

export type IndexLabelNode = {
  id: PaperId;
  title: string;
  side: 'top' | 'bottom' | 'left' | 'right';
  centerX: number;
  centerY: number;
  extent?: number;
  background?: string;
  borderColor?: string;
  textColor?: string;
};

interface IndexLabelProps {
  node: IndexLabelNode;
  canvasWidth: number;
  canvasHeight: number;
  onClick: (nodeId: PaperId) => void;
}

export const TAB_THICK = 22;
export const TAB_LEN = 80;
export const TAB_MIN_LEN = 80;
export const TAB_MAX_LEN = 108;
export const TAB_PACKED_MIN_LEN = 48;
const BORDER_COLOR = 'rgba(0,0,0,0.18)';

export function getIndexLabelExtent(title: string, side: IndexLabelNode['side']) {
  if (side === 'top' || side === 'bottom') return TAB_LEN;
  const estimated = TAB_LEN + Math.max(0, title.trim().length - 10) * 2;
  return Math.max(TAB_MIN_LEN, Math.min(TAB_MAX_LEN, estimated));
}

function getIndexLabelFontSize(title: string, side: IndexLabelNode['side']) {
  if (side === 'top' || side === 'bottom') return 10;
  const length = title.trim().length;
  if (length >= 24) return 7;
  if (length >= 16) return 8;
  if (length >= 10) return 9;
  return 10;
}

export function IndexLabel({
  node,
  canvasWidth,
  canvasHeight,
  onClick,
}: IndexLabelProps) {
  const { side, centerX, centerY } = node;

  const base: React.CSSProperties = {
    position: 'absolute',
    zIndex: 50,
    background: node.background ?? 'rgba(248, 246, 240, 0.95)',
    color: node.textColor ?? '#333',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: node.borderColor ?? BORDER_COLOR,
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
    fontSize: getIndexLabelFontSize(node.title, side),
    fontWeight: 600,
    letterSpacing: '0.03em',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (side === 'bottom') {
    const left = Math.max(0, Math.min(centerX - TAB_LEN / 2, canvasWidth - TAB_LEN));
    return (
      <button
        title={node.title}
        style={{
          ...base,
          bottom: 0,
          left,
          width: TAB_LEN,
          height: TAB_THICK,
          borderRadius: '6px 6px 0 0',
          borderBottomWidth: 0,
          padding: '0 8px',
        }}
        onClick={() => onClick(node.id)}
      >
        {node.title}
      </button>
    );
  }

  if (side === 'top') {
    const left = Math.max(0, Math.min(centerX - TAB_LEN / 2, canvasWidth - TAB_LEN));
    return (
      <button
        title={node.title}
        style={{
          ...base,
          top: 0,
          left,
          width: TAB_LEN,
          height: TAB_THICK,
          borderRadius: '0 0 6px 6px',
          borderTopWidth: 0,
          padding: '0 8px',
        }}
        onClick={() => onClick(node.id)}
      >
        {node.title}
      </button>
    );
  }

  if (side === 'left') {
    const extent = node.extent ?? getIndexLabelExtent(node.title, side);
    const top = Math.max(0, Math.min(centerY - extent / 2, canvasHeight - extent));
    return (
      <button
        title={node.title}
        style={{
          ...base,
          left: 0,
          top,
          width: TAB_THICK,
          height: extent,
          borderRadius: `0 ${Math.floor(TAB_THICK / 2)}px ${Math.floor(TAB_THICK / 2)}px 0`,
          borderLeftWidth: 0,
          writingMode: 'vertical-rl',
          padding: '8px 0',
        }}
        onClick={() => onClick(node.id)}
      >
        {node.title}
      </button>
    );
  }

  const extent = node.extent ?? getIndexLabelExtent(node.title, side);
  const top = Math.max(0, Math.min(centerY - extent / 2, canvasHeight - extent));
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
        height: extent,
        borderRadius: '6px 0 0 6px',
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
