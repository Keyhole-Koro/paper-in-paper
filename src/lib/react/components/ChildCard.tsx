import { useRef, useState } from 'react';
import type { Paper, PaperId } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';

interface ChildCardProps {
  paper: Paper;
  parentId: PaperId;
}

const DRAG_THRESHOLD = 5;

export function ChildCard({ paper, parentId }: ChildCardProps) {
  const { dispatch } = usePaperStore();
  const { startDrag } = useDrag();
  const [hovered, setHovered] = useState(false);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    dragging.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointerDownPos.current || dragging.current) return;
    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragging.current = true;
      startDrag(
        { draggedPaperId: paper.id, sourceParentId: parentId, mode: 'reorder', draggedTitle: paper.title },
        { x: e.clientX, y: e.clientY },
      );
    }
  }

  function handlePointerUp() {
    if (!dragging.current) {
      dispatch({ type: 'OPEN_NODE', parentId, childId: paper.id });
    }
    pointerDownPos.current = null;
    dragging.current = false;
  }

  return (
    <div
      data-child-id={paper.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'inline-block',
        padding: '6px 12px',
        border: '1px solid #ccc',
        borderRadius: 6,
        cursor: 'grab',
        background: hovered ? '#f5f5f5' : '#fff',
        fontSize: 13,
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {paper.title}

      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            padding: '6px 10px',
            background: '#333',
            color: '#fff',
            borderRadius: 4,
            fontSize: 12,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 100,
          }}
        >
          {paper.description}
        </div>
      )}
    </div>
  );
}
