import { useRef } from 'react';
import type { PaperId } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import { useCreateChild } from '../context/CreateChildContext';
import type { PaperTone } from '../internal/paperColors';
import { PaperBreadcrumbs } from './PaperBreadcrumbs';

const DRAG_THRESHOLD = 5;

interface PaperHeaderProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  title: string;
  tone: PaperTone;
  isFocused: boolean;
  isPinned: boolean;
  currentShare?: number;
}

export function PaperHeader({ nodeId, parentId, title, tone, isFocused, isPinned, currentShare }: PaperHeaderProps) {
  const { config, dispatch } = usePaperStore();
  const { startDrag } = useDrag();
  const onCreateChild = useCreateChild();

  const isRoot = parentId === null;
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  function handlePointerDown(e: React.PointerEvent) {
    if (isRoot || e.button !== 0) return;
    pointerDown.current = { x: e.clientX, y: e.clientY };
    didDrag.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointerDown.current || didDrag.current) return;
    const dx = e.clientX - pointerDown.current.x;
    const dy = e.clientY - pointerDown.current.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      didDrag.current = true;
      startDrag(
        { draggedPaperId: nodeId, sourceParentId: parentId!, mode: 'move-parent', draggedTitle: title },
        { x: e.clientX, y: e.clientY },
      );
    }
  }

  function handlePointerUp() {
    if (!didDrag.current) {
      dispatch({ type: 'FOCUS_NODE', nodeId });
    }
    pointerDown.current = null;
    didDrag.current = false;
  }

  function handleClose(e: React.MouseEvent | React.PointerEvent) {
    e.stopPropagation();
    if (isRoot || !parentId) return;
    dispatch({ type: 'FOCUS_NODE', nodeId: parentId });
    dispatch({ type: 'CLOSE_NODE', parentId, childId: nodeId });
  }

  function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onCreateChild) return;
    onCreateChild(nodeId, ({ title, content, description = '', hue }) => {
      dispatch({ type: 'CREATE_CHILD_NODE', parentId: nodeId, title, content, description, hue });
    });
  }

  function stopPointerEvent(e: React.PointerEvent) {
    e.stopPropagation();
  }

  function handlePinToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (isRoot) return;
    if (isPinned) {
      dispatch({ type: 'UNPIN_NODE', nodeId });
      return;
    }
    dispatch({ type: 'PIN_NODE', nodeId, minShare: currentShare });
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        height: config.paperNode.headerHeight,
        background: isFocused ? tone.headerBackgroundFocused : tone.headerBackground,
        borderBottom: `1px solid ${tone.divider}`,
        cursor: isRoot ? 'default' : 'grab',
        userSelect: 'none',
        flexShrink: 0,
        boxSizing: 'border-box',
        touchAction: 'none',
        minWidth: 0,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {!isRoot && parentId ? (
        <PaperBreadcrumbs nodeId={nodeId} parentId={parentId} title={title} tone={tone} />
      ) : (
        <span
          style={{
            fontWeight: 600,
            fontSize: 14,
            color: tone.title,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: 'block',
            minWidth: 0,
            flex: 1,
          }}
        >
          {title}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {onCreateChild && (
          <button
            type="button"
            onPointerDown={stopPointerEvent}
            onPointerUp={stopPointerEvent}
            onClick={handleAddChild}
            style={{
              fontSize: 14,
              color: tone.mutedText,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 2px',
              border: 'none',
              background: 'transparent',
            }}
          >
            +
          </button>
        )}
        {!isRoot && (
          <button
            type="button"
            aria-label={isPinned ? 'Unpin node' : 'Pin node'}
            onPointerDown={stopPointerEvent}
            onPointerUp={stopPointerEvent}
            onClick={handlePinToggle}
            style={{
              fontSize: 11,
              color: isPinned ? tone.accent : tone.mutedText,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 2px',
              border: 'none',
              background: 'transparent',
              fontWeight: isPinned ? 700 : 400,
            }}
          >
            P
          </button>
        )}
        {!isRoot && (
          <button
            type="button"
            aria-label="Close node"
            onPointerDown={stopPointerEvent}
            onPointerUp={stopPointerEvent}
            onClick={handleClose}
            style={{
              fontSize: 11,
              color: tone.mutedText,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 2px',
              border: 'none',
              background: 'transparent',
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
