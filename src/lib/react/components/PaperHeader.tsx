import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { getVisibleChildIds } from '../../core/expansion';
import type { PaperId } from '../../core/types';
import { useCanvasOptions } from '../context/CanvasOptionsContext';
import { useDragStore } from '../drag/dragContext';
import type { PaperTone } from '../internal/paperColors';
import { usePaperStoreApi, useStoreValue } from '../store/storeContext';

const DRAG_THRESHOLD = 5;

function PinSymbol({ isPinned }: { isPinned: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      style={{ display: 'block' }}
    >
      <path d="M12 17v5" />
      <path
        d="M5 17h14v-2.75a2 2 0 0 0-.59-1.42L16 10.42V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v6.42l-2.41 2.41A2 2 0 0 0 5 14.25Z"
        fill={isPinned ? 'currentColor' : 'none'}
        fillOpacity={isPinned ? 0.16 : undefined}
      />
    </svg>
  );
}

interface PaperHeaderProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  title: string;
  tone: PaperTone;
  isFocused: boolean;
  isPinned: boolean;
  height: number;
}

const iconButton = (color: string): CSSProperties => ({
  font: 'inherit',
  fontSize: 14,
  width: 28,
  height: 28,
  display: 'grid',
  placeItems: 'center',
  color,
  cursor: 'pointer',
  lineHeight: 1,
  padding: 0,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  flexShrink: 0,
});

function stopPointer(event: PointerEvent) {
  event.stopPropagation();
}

/**
 * A paper's title bar. Pressing it focuses the paper; dragging it moves the paper (when the
 * canvas allows dragging). The title is a button too, so keyboard users can focus a paper and
 * move it among its siblings with Alt + arrow keys.
 */
export function PaperHeader({ nodeId, parentId, title, tone, isFocused, isPinned, height }: PaperHeaderProps) {
  const store = usePaperStoreApi();
  const dragStore = useDragStore();
  const { labels, draggable, hasCreateChild, getCallbacks } = useCanvasOptions();
  const parentTitle = useStoreValue((snapshot) =>
    parentId === null ? null : snapshot.state.paperMap.get(parentId)?.title ?? null);
  const press = useRef<{ x: number; y: number; dragged: boolean } | null>(null);

  const isRoot = parentId === null;
  const canMove = draggable && !isRoot;

  const allowsReorder = () => {
    if (!canMove || parentId === null) return false;
    const canDrop = getCallbacks().canDrop;
    return !canDrop || canDrop({ nodeId, sourceParentId: parentId, targetParentId: parentId, insertBeforeId: null }) !== false;
  };

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    press.current = { x: event.clientX, y: event.clientY, dragged: false };
    if (canMove) event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = press.current;
    if (!current || current.dragged || !canMove) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) <= DRAG_THRESHOLD) return;
    current.dragged = true;
    dragStore.startDrag(
      { draggedPaperId: nodeId, sourceParentId: parentId, mode: 'move', draggedTitle: title },
      { x: event.clientX, y: event.clientY },
    );
  }

  function handlePointerUp() {
    const current = press.current;
    press.current = null;
    if (current && !current.dragged) store.dispatch({ type: 'FOCUS_NODE', nodeId });
  }

  function handleTitleClick(event: MouseEvent) {
    // Pointer presses are handled by the bar itself; this is keyboard activation.
    if (event.detail === 0) store.dispatch({ type: 'FOCUS_NODE', nodeId });
  }

  function handleTitleKeyDown(event: KeyboardEvent) {
    if (!event.altKey || parentId === null) return;
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    if (!back && !forward) return;
    event.preventDefault();
    if (!allowsReorder()) return;
    const state = store.getState();
    const siblings = getVisibleChildIds(state.paperMap, state.expansionMap, parentId);
    const index = siblings.indexOf(nodeId);
    if (index === -1) return;
    if (back && index > 0) {
      store.dispatch({ type: 'REORDER_WITHIN_PARENT', parentId, paperId: nodeId, insertBeforeId: siblings[index - 1] });
    } else if (forward && index < siblings.length - 1) {
      store.dispatch({ type: 'REORDER_WITHIN_PARENT', parentId, paperId: nodeId, insertBeforeId: siblings[index + 2] ?? null });
    }
  }

  function handleCollapseToParent(event: MouseEvent) {
    event.stopPropagation();
    if (parentId === null) return;
    store.dispatchAll([
      { type: 'CLOSE_CHILDREN', nodeId: parentId },
      { type: 'FOCUS_NODE', nodeId: parentId },
    ]);
  }

  function handleClose(event: MouseEvent) {
    event.stopPropagation();
    if (parentId === null) return;
    store.dispatchAll([
      { type: 'CLOSE_NODE', parentId, childId: nodeId },
      { type: 'FOCUS_NODE', nodeId: parentId },
    ]);
  }

  function handleAddChild(event: MouseEvent) {
    event.stopPropagation();
    getCallbacks().onCreateChild?.(nodeId, ({ title: childTitle, content, description = '', hue, id }) => {
      store.dispatch({ type: 'CREATE_CHILD_NODE', id, parentId: nodeId, title: childTitle, content, description, hue });
    });
  }

  function handlePinToggle(event: MouseEvent) {
    event.stopPropagation();
    if (isRoot) return;
    if (isPinned) {
      store.dispatch({ type: 'UNPIN_NODE', nodeId });
      return;
    }
    store.dispatch({ type: 'PIN_NODE', nodeId, minShare: currentShare(store.getSnapshot().layout, nodeId, parentId) });
  }

  const crumbStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    font: 'inherit',
    fontSize: 13,
    padding: '0 2px',
    borderRadius: 3,
    whiteSpace: 'nowrap',
    color: tone.mutedText,
    cursor: 'pointer',
    flexShrink: 0,
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        padding: '0 8px 0 12px',
        height,
        background: isFocused ? tone.headerBackgroundFocused : tone.headerBackground,
        borderBottom: `1px solid ${tone.divider}`,
        cursor: canMove ? 'grab' : 'default',
        userSelect: 'none',
        flexShrink: 0,
        boxSizing: 'border-box',
        touchAction: canMove ? 'none' : 'auto',
        minWidth: 0,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        press.current = null;
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {parentTitle !== null && (
          <>
            <button
              type="button"
              title={labels.collapseTo(parentTitle)}
              onPointerDown={stopPointer}
              onPointerUp={stopPointer}
              onClick={handleCollapseToParent}
              style={{ ...crumbStyle, maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {parentTitle}
            </button>
            <span aria-hidden="true" style={{ margin: '0 3px', color: tone.mutedText, fontSize: 11, flexShrink: 0 }}>/</span>
          </>
        )}
        <button
          type="button"
          aria-current={isFocused ? 'true' : undefined}
          // Host callbacks are not called during render; the key handler still asks canDrop.
          aria-description={canMove ? labels.paperTitleHint : undefined}
          onClick={handleTitleClick}
          onKeyDown={handleTitleKeyDown}
          style={{
            ...crumbStyle,
            cursor: 'inherit',
            color: tone.title,
            fontSize: isRoot ? 14 : 13,
            fontWeight: 600,
            flexShrink: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: 'left',
          }}
        >
          {title}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {hasCreateChild && (
          <button
            type="button"
            aria-label={labels.addChild}
            title={labels.addChild}
            onPointerDown={stopPointer}
            onPointerUp={stopPointer}
            onClick={handleAddChild}
            style={iconButton(tone.mutedText)}
          >
            +
          </button>
        )}
        {!isRoot && (
          <button
            type="button"
            aria-label={isPinned ? labels.unpinPaper : labels.pinPaper}
            aria-pressed={isPinned}
            title={isPinned ? labels.unpinPaper : labels.pinPaper}
            onPointerDown={stopPointer}
            onPointerUp={stopPointer}
            onClick={handlePinToggle}
            style={iconButton(isPinned ? tone.accent : tone.mutedText)}
          >
            <PinSymbol isPinned={isPinned} />
          </button>
        )}
        {!isRoot && (
          <button
            type="button"
            aria-label={labels.closePaper}
            title={labels.closePaper}
            onPointerDown={stopPointer}
            onPointerUp={stopPointer}
            onClick={handleClose}
            style={{ ...iconButton(tone.mutedText), fontSize: 12 }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/** The share of its parent's room a paper fills right now (what pinning keeps it at). */
function currentShare(
  layout: { entries: Map<PaperId, { roomLayout: { childRects: Map<PaperId, { width: number; height: number }>; contentRect: { width: number; height: number } } }> },
  nodeId: PaperId,
  parentId: PaperId | null,
): number | undefined {
  if (parentId === null) return undefined;
  const parent = layout.entries.get(parentId);
  const rect = parent?.roomLayout.childRects.get(nodeId);
  if (!parent || !rect) return undefined;
  let area = parent.roomLayout.contentRect.width * parent.roomLayout.contentRect.height;
  for (const child of parent.roomLayout.childRects.values()) area += child.width * child.height;
  return area > 0 ? (rect.width * rect.height) / area : undefined;
}
