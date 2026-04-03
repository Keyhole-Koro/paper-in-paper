import { useDrag } from '../context/DragContext';

export function FloatingLayer() {
  const { session, pointerPos } = useDrag();
  if (!session) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: `translate(${pointerPos.x + 12}px, ${pointerPos.y - 10}px)`,
      }}
    >
      <div
        style={{
          padding: '5px 12px',
          background: '#4a90e2',
          color: '#fff',
          borderRadius: 6,
          fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          opacity: 0.9,
          whiteSpace: 'nowrap',
        }}
      >
        {session.draggedTitle}
      </div>
    </div>
  );
}
