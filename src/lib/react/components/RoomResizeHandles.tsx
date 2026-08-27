import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PaperId } from '../../core/types';
import type { RoomDivider, RoomSplit } from '../../core/roomSplit';
import { usePaperDispatch } from '../context/PaperStoreContext';
import type { PaperTone } from '../internal/paperColors';

/** Grab strip thickness in px. Wide enough to hit, narrow enough to stay out of the way. */
const HANDLE_THICKNESS = 7;
/** Rects thinner than this get no grip at all — there is nothing to grab. */
const MIN_GRABBABLE_PX = 24;

export type ResizeEdge = 'left' | 'right' | 'top' | 'bottom';

/**
 * A paper's content can be an iframe, and an iframe hit-test swallows the
 * pointer: the moment a drag crosses one, the top document stops receiving
 * pointermove and the resize silently dies mid-gesture — setPointerCapture on
 * the grip does not save it, because the capture lives in the outer document
 * and the hit-test never gets there. So for the duration of a drag, iframes
 * stop taking pointer events. The same rule carries the resize cursor and
 * suppresses text selection across the whole page.
 */
const RESIZING_ATTR = 'data-pip-resizing';
let resizeStyleEl: HTMLStyleElement | null = null;

function beginGlobalResize(axis: 'x' | 'y') {
  if (typeof document === 'undefined') return;
  if (!resizeStyleEl) {
    resizeStyleEl = document.createElement('style');
    resizeStyleEl.textContent = [
      `[${RESIZING_ATTR}] iframe { pointer-events: none !important; }`,
      `[${RESIZING_ATTR}] { user-select: none !important; }`,
      `[${RESIZING_ATTR}="x"] * { cursor: col-resize !important; }`,
      `[${RESIZING_ATTR}="y"] * { cursor: row-resize !important; }`,
    ].join('\n');
    document.head.appendChild(resizeStyleEl);
  }
  document.documentElement.setAttribute(RESIZING_ATTR, axis);
}

function endGlobalResize() {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute(RESIZING_ATTR);
}

interface DragSession {
  pointerId: number;
  originX: number;
  originY: number;
  /**
   * The arrangement the drag started from. Every move re-applies an absolute
   * ratio to this same base, so a drag cannot compound its own results.
   */
  split: RoomSplit;
  startRatio: number;
}

interface ResizeHandleProps {
  edge: ResizeEdge;
  divider: RoomDivider;
  roomId: PaperId;
  split: RoomSplit;
  isManual: boolean;
  tone: PaperTone;
}

/**
 * One grip. It sits on the edge of a pane and moves the divider that edge
 * falls on, which may be the boundary between two panes or between two whole
 * rows — dragging it always moves the line the user is pointing at.
 */
function ResizeHandle({ edge, divider, roomId, split, isManual, tone }: ResizeHandleProps) {
  const dispatch = usePaperDispatch();
  const dragAxis: 'x' | 'y' = divider.axis === 'horizontal' ? 'x' : 'y';
  const sessionRef = useRef<DragSession | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const cancelFrame = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingRef.current = null;
  }, []);

  useEffect(() => () => {
    cancelFrame();
    // Unmounting mid-drag (the layout can replace this pane) must not leave the
    // page stuck with iframes inert and a resize cursor.
    if (sessionRef.current) endGlobalResize();
  }, [cancelFrame]);

  // Pointermove fires far more often than the layout can usefully recompute,
  // so coalesce to one dispatch per frame.
  const scheduleRatio = useCallback(
    (ratio: number) => {
      pendingRef.current = ratio;
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const next = pendingRef.current;
        pendingRef.current = null;
        const session = sessionRef.current;
        if (next === null || !session) return;
        dispatch({ type: 'RESIZE_SPLIT', roomId, split: session.split, target: divider.target, ratio: next });
      });
    },
    [dispatch, roomId, divider.target],
  );

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    beginGlobalResize(dragAxis);
    sessionRef.current = {
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      split,
      startRatio: divider.ratio,
    };
    setIsActive(true);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    if (divider.pairExtentPx <= 0) return;
    // The divider follows the pointer, so the delta reads the same whichever
    // of the two panes the grip belongs to.
    const delta = dragAxis === 'x' ? e.clientX - session.originX : e.clientY - session.originY;
    scheduleRatio(session.startRatio + delta / divider.pairExtentPx);
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    sessionRef.current = null;
    setIsActive(false);
    endGlobalResize();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    cancelFrame();
    dispatch({ type: 'RESET_ROOM_SPLIT', roomId });
  }

  const highlighted = isActive || isHovered;
  const lineColor = highlighted ? tone.accent : tone.divider;
  const lineThickness = highlighted ? 3 : 2;
  const vertical = dragAxis === 'x';

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={vertical ? 'Resize width' : 'Resize height'}
      data-resize-edge={edge}
      title={isManual ? 'Drag to resize · double-click to restore the automatic layout' : 'Drag to resize'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'absolute',
        zIndex: 15,
        touchAction: 'none',
        cursor: vertical ? 'col-resize' : 'row-resize',
        display: 'flex',
        // Keep the painted line pinned to the edge the grip sits on.
        alignItems: vertical ? 'stretch' : edge === 'top' ? 'flex-start' : 'flex-end',
        justifyContent: vertical ? (edge === 'left' ? 'flex-start' : 'flex-end') : 'stretch',
        ...(vertical
          ? { top: 0, [edge]: 0, width: HANDLE_THICKNESS, height: '100%' }
          : { left: 0, [edge]: 0, height: HANDLE_THICKNESS, width: '100%' }),
      }}
    >
      <div
        style={{
          background: lineColor,
          // A hand-arranged room keeps a faint mark on its dividers — loud
          // enough to find, quiet enough to not read as a border.
          opacity: highlighted ? 1 : isManual ? 0.45 : 0,
          transition: 'opacity 0.12s, background 0.12s',
          ...(vertical
            ? { width: lineThickness, height: '100%' }
            : { height: lineThickness, width: '100%' }),
        }}
      />
    </div>
  );
}

interface RoomResizeHandlesProps {
  /** The paper whose room this pane lives in. */
  roomId: PaperId;
  /** This pane's id within the room: a child's PaperId, or the content id. */
  itemId: string;
  rect: { width: number; height: number };
  split: RoomSplit | null;
  dividers: Partial<Record<ResizeEdge, RoomDivider>> | undefined;
  isManual: boolean;
  tone: PaperTone;
}

/**
 * Renders the grips for one pane. Only edges that fall on a divider get one —
 * an edge against the room boundary has nothing to trade with.
 */
export function RoomResizeHandles({
  roomId,
  itemId,
  rect,
  split,
  dividers,
  isManual,
  tone,
}: RoomResizeHandlesProps) {
  if (!split || !dividers) return null;
  if (rect.width < MIN_GRABBABLE_PX || rect.height < MIN_GRABBABLE_PX) return null;

  const edges = (['left', 'right', 'top', 'bottom'] as ResizeEdge[]).filter((edge) => dividers[edge]);
  if (edges.length === 0) return null;

  return (
    <>
      {edges.map((edge) => (
        <ResizeHandle
          key={`${itemId}:${edge}`}
          edge={edge}
          divider={dividers[edge]!}
          roomId={roomId}
          split={split}
          isManual={isManual}
          tone={tone}
        />
      ))}
    </>
  );
}
