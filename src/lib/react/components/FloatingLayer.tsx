import { useCanvasOptions } from '../context/CanvasOptionsContext';
import { useDragValue } from '../drag/dragContext';

/** The ghost that follows the pointer during a drag. The only thing that re-renders per frame. */
export function FloatingLayer() {
  const session = useDragValue((drag) => drag.session);
  const pointer = useDragValue((drag) => drag.pointer);
  const hasTarget = useDragValue((drag) => drag.insertTarget !== null);
  const { colorScheme } = useCanvasOptions();
  if (!session) return null;

  const dark = colorScheme === 'dark';
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: `translate(${pointer.x + 12}px, ${pointer.y - 10}px)`,
      }}
    >
      <div
        style={{
          padding: '5px 12px',
          background: dark ? 'rgba(236, 236, 240, 0.94)' : 'rgba(28, 28, 32, 0.9)',
          color: dark ? '#1c1c20' : '#fff',
          borderRadius: 6,
          fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          opacity: hasTarget ? 1 : 0.6,
          whiteSpace: 'nowrap',
        }}
      >
        {session.draggedTitle}
      </div>
    </div>
  );
}
