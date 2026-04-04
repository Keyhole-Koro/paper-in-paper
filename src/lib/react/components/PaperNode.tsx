import { useEffect } from 'react';
import type { PaperId } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import { usePaperLayout } from '../hooks/usePaperLayout';
import { useRoomSize } from '../hooks/useRoomSize';
import {
  getPaperTone,
  resolvePaperColorContext,
  type PaperColorContext,
} from '../internal/paperColors';
import { PaperContentFrame } from './PaperContentFrame';

const HEADER_HEIGHT = 37;

interface PaperNodeProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  inheritedColor?: PaperColorContext | null;
}

export function PaperNode({ nodeId, parentId, inheritedColor = null }: PaperNodeProps) {
  const { state, dispatch } = usePaperStore();
  const { session, insertTarget, registerRoom } = useDrag();
  const [roomRef, roomSize] = useRoomSize();

  const paper = state.paperMap.get(nodeId);
  const isRoot = parentId === null;

  const roomHeight = Math.max(0, roomSize.height - HEADER_HEIGHT);

  const layout = usePaperLayout(nodeId, roomSize.width, roomHeight);

  useEffect(() => {
    registerRoom(nodeId, roomRef.current);
    return () => registerRoom(nodeId, null);
  }, [nodeId, registerRoom, roomRef]);

  if (!paper) return null;

  const isFocused = state.focusedNodeId === nodeId;
  const isDragTarget = session !== null && insertTarget?.parentId === nodeId;
  const color = resolvePaperColorContext(paper.hue, inheritedColor);
  const tone = getPaperTone(color, { isRoot, isFocused });

  function handleHeaderClick() {
    if (isRoot) return;
    dispatch({ type: 'CLOSE_NODE', parentId: parentId!, childId: nodeId });
  }

  return (
    <div
      style={{
        border: `1px solid ${isFocused ? tone.accent : tone.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: tone.background,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          height: HEADER_HEIGHT,
          background: isFocused ? tone.headerBackgroundFocused : tone.headerBackground,
          borderBottom: `1px solid ${tone.divider}`,
          cursor: isRoot ? 'default' : 'pointer',
          userSelect: 'none',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
        onClick={handleHeaderClick}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: tone.title }}>{paper.title}</span>
        {!isRoot && <span style={{ fontSize: 11, color: tone.mutedText }}>✕</span>}
      </div>

      {/* room: 絶対配置で content + open children を 2D 配置 */}
      <div
        ref={roomRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          outline: isDragTarget ? `2px dashed ${tone.accent}` : '2px dashed transparent',
          transition: 'outline 0.1s',
        }}
      >
        {/* content */}
        <div
          style={{
            position: 'absolute',
            left: layout.contentRect.x,
            top: layout.contentRect.y,
            width: layout.contentRect.width,
            height: layout.contentRect.height,
            overflow: 'auto',
            borderRight: layout.childRects.size > 0 ? `1px solid ${tone.divider}` : 'none',
            boxSizing: 'border-box',
            padding: 10,
            color: tone.text,
          }}
        >
          <PaperContentFrame
            nodeId={nodeId}
            content={paper.content}
            isRoot={isRoot}
            theme={{
              surface: tone.background,
              surfaceAlt: tone.backgroundHover,
              surfaceRaised: tone.headerBackground,
              text: tone.text,
              mutedText: tone.mutedText,
              divider: tone.divider,
              linkBackground: tone.headerBackground,
              linkBackgroundHover: tone.backgroundHover,
              linkBorder: tone.border,
              linkText: tone.title,
            }}
          />
        </div>

        {/* open children */}
        {Array.from(layout.childRects.entries()).map(([childId, rect]) => (
          <div
            key={childId}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              overflow: 'hidden',
              borderLeft: `1px solid ${tone.divider}`,
              borderTop: rect.y > 0 ? `1px solid ${tone.divider}` : 'none',
              boxSizing: 'border-box',
            }}
          >
            <PaperNode nodeId={childId} parentId={nodeId} inheritedColor={color} />
          </div>
        ))}
      </div>
    </div>
  );
}
