import { useRef, useState } from 'react';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';

export function Sidebar() {
  const { state, dispatch } = usePaperStore();
  const [newTitle, setNewTitle] = useState('');

  function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    dispatch({
      type: 'CREATE_UNPLACED_NODE',
      title,
      description: '',
      content: `<p>${title}</p>`,
    });
    setNewTitle('');
  }

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderLeft: '1px solid #e0e0e0',
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* header */}
      <div
        style={{
          padding: '12px 14px',
          fontWeight: 600,
          fontSize: 13,
          borderBottom: '1px solid #e0e0e0',
          color: '#555',
        }}
      >
        Unplaced
      </div>

      {/* new node input */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #e0e0e0' }}>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="New paper title…"
          style={{
            width: '100%',
            padding: '5px 8px',
            fontSize: 13,
            border: '1px solid #ccc',
            borderRadius: 4,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={handleCreate}
          style={{
            marginTop: 6,
            width: '100%',
            padding: '5px 0',
            fontSize: 12,
            background: '#4a90e2',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          + Add
        </button>
      </div>

      {/* unplaced node list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {state.unplacedNodeIds.length === 0 && (
          <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 12 }}>
            No unplaced papers
          </p>
        )}
        {state.unplacedNodeIds.map((id) => {
          const paper = state.paperMap.get(id);
          if (!paper) return null;
          return (
            <SidebarCard key={id} paperId={id} title={paper.title} description={paper.description} />
          );
        })}
      </div>
    </div>
  );
}

interface SidebarCardProps {
  paperId: string;
  title: string;
  description: string;
}

const DRAG_THRESHOLD = 5;

function SidebarCard({ paperId, title, description }: SidebarCardProps) {
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
        { draggedPaperId: paperId, sourceParentId: null, mode: 'attach-unplaced', draggedTitle: title },
        { x: e.clientX, y: e.clientY },
      );
    }
  }

  function handlePointerUp() {
    pointerDownPos.current = null;
    dragging.current = false;
  }

  return (
    <div
      data-child-id={paperId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '6px 10px',
        border: '1px solid #ddd',
        borderRadius: 6,
        background: hovered ? '#f0f0f0' : '#fff',
        fontSize: 13,
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
    >
      {title}
      {hovered && description && (
        <div
          style={{
            position: 'absolute',
            right: '100%',
            top: 0,
            marginRight: 8,
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
          {description}
        </div>
      )}
    </div>
  );
}
