import { useEffect } from 'react';
import type { PaperId } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import { usePaperLayout } from '../hooks/usePaperLayout';
import { useRoomSize } from '../hooks/useRoomSize';
import { PaperContentFrame } from './PaperContentFrame';
import { ChildCard } from './ChildCard';

const HEADER_HEIGHT = 37;
const CLOSED_CARDS_HEIGHT = 52;

interface PaperNodeProps {
  nodeId: PaperId;
  parentId: PaperId | null;
}

export function PaperNode({ nodeId, parentId }: PaperNodeProps) {
  const { state, dispatch } = usePaperStore();
  const { session, insertTarget, registerRoom } = useDrag();
  const [roomRef, roomSize] = useRoomSize();

  const paper = state.paperMap.get(nodeId);
  const isRoot = parentId === null;

  // room 内の利用可能高さ（header と closed cards の分を引く）
  const hasClosedChildren = (paper?.childIds ?? []).some(
    (id) => !(state.expansionMap.get(nodeId)?.openChildIds ?? []).includes(id),
  );
  const reservedHeight =
    HEADER_HEIGHT + (hasClosedChildren ? CLOSED_CARDS_HEIGHT : 0);
  const roomHeight = Math.max(0, roomSize.height - reservedHeight);

  const layout = usePaperLayout(nodeId, roomSize.width, roomHeight);

  useEffect(() => {
    registerRoom(nodeId, roomRef.current);
    return () => registerRoom(nodeId, null);
  }, [nodeId, registerRoom, roomRef]);

  if (!paper) return null;

  const isFocused = state.focusedNodeId === nodeId;
  const isDragTarget = session !== null && insertTarget?.parentId === nodeId;

  function handleHeaderClick() {
    if (isRoot) return;
    dispatch({ type: 'CLOSE_NODE', parentId: parentId!, childId: nodeId });
  }

  return (
    <div
      style={{
        border: `1px solid ${isFocused ? '#4a90e2' : '#ddd'}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
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
          background: isFocused ? '#eaf3ff' : '#fafafa',
          borderBottom: '1px solid #eee',
          cursor: isRoot ? 'default' : 'pointer',
          userSelect: 'none',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
        onClick={handleHeaderClick}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>{paper.title}</span>
        {!isRoot && <span style={{ fontSize: 11, color: '#aaa' }}>✕</span>}
      </div>

      {/* room: 絶対配置で content + open children を 2D 配置 */}
      <div
        ref={roomRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          outline: isDragTarget ? '2px dashed #4a90e2' : '2px dashed transparent',
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
            borderRight: layout.childRects.size > 0 ? '1px solid #eee' : 'none',
            boxSizing: 'border-box',
            padding: 10,
          }}
        >
          <PaperContentFrame nodeId={nodeId} content={paper.content} />
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
              borderLeft: '1px solid #eee',
              borderTop: rect.y > 0 ? '1px solid #eee' : 'none',
              boxSizing: 'border-box',
            }}
          >
            <PaperNode nodeId={childId} parentId={nodeId} />
          </div>
        ))}
      </div>

      {/* closed child cards */}
      {layout.closedChildIds.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: '8px 14px',
            borderTop: '1px solid #eee',
            flexShrink: 0,
            height: CLOSED_CARDS_HEIGHT,
            alignItems: 'center',
            boxSizing: 'border-box',
            overflowX: 'auto',
          }}
        >
          {layout.closedChildIds.map((childId) => {
            const childPaper = state.paperMap.get(childId);
            if (!childPaper) return null;
            return <ChildCard key={childId} paper={childPaper} parentId={nodeId} />;
          })}
        </div>
      )}
    </div>
  );
}
