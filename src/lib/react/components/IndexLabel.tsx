import React from 'react';
import type { PaperId } from '../../core/types';

export type IndexLabelNode = {
  id: PaperId;
  title: string;
  side: 'top' | 'bottom' | 'left' | 'right';
  centerX: number;
  centerY: number;
};

interface IndexLabelProps {
  node: IndexLabelNode;
  canvasWidth: number;
  canvasHeight: number;
  onClick: (nodeId: PaperId) => void;
}

const TAB_THICK = 22;
const TAB_LEN = 80;
const BORDER_COLOR = 'rgba(0,0,0,0.18)';

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
    const top = Math.max(0, Math.min(centerY - TAB_LEN / 2, canvasHeight - TAB_LEN));
    return (
      <button
        title={node.title}
        style={{
          ...base,
          left: 0,
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

  const top = Math.max(0, Math.min(centerY - TAB_LEN / 2, canvasHeight - TAB_LEN));
  return (
    <button
      title={node.title}
      style={{
        ...base,
        right: 0,
        top,
        width: TAB_THICK,
        height: TAB_LEN,
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
