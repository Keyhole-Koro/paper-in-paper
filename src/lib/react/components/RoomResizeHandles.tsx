import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutRect } from '../../core/layout';
import type { PaperId } from '../../core/types';
import { usePaperDispatch, usePaperStoreSelector } from '../context/PaperStoreContext';
import type { PaperTone } from '../internal/paperColors';

/** Grab strip thickness in px. Wide enough to hit, narrow enough to stay out of the way. */
const HANDLE_THICKNESS = 7;
/** A rect never resizes below this, so a handle can always be grabbed again. */
const MIN_RESIZE_PX = 28;
/** Rects thinner than this get no handle at all — there is nothing to grab. */
const MIN_RESIZABLE_PX = 24;
/** Rounding slack when deciding whether an edge touches the room boundary. */
const EDGE_EPSILON = 1.5;

export type ResizeTargetKind = 'node' | 'content';
type ResizeAxis = 'x' | 'y';

interface DragSession {
  pointerId: number;
  axis: ResizeAxis;
  originX: number;
  originY: number;
  baseWidth: number;
  baseHeight: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface ResizeHandleProps {
  axis: ResizeAxis;
  rect: LayoutRect;
  roomWidth: number;
  roomHeight: number;
  isManual: boolean;
  tone: PaperTone;
  onShareChange: (share: number) => void;
  onReset: () => void;
}

/**
 * A single edge grip. Dragging it changes the rect's *area* share of the room:
 * the layout engine places rects by area, so the drag distance is converted to
 * a target area rather than to an absolute width/height. In a single-row room
 * that is exactly the edge the user grabbed; in a reflowed treemap the rect may
 * settle into a different aspect ratio at the same size.
 */
function ResizeHandle({
  axis,
  rect,
  roomWidth,
  roomHeight,
  isManual,
  tone,
  onShareChange,
  onReset,
}: ResizeHandleProps) {
  const sessionRef = useRef<DragSession | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingShareRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const cancelFrame = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    pendingShareRef.current = null;
  }, []);

  useEffect(() => cancelFrame, [cancelFrame]);

  // Pointermove fires far more often than the layout can usefully recompute,
  // so coalesce to one dispatch per frame.
  const scheduleShare = useCallback(
    (share: number) => {
      pendingShareRef.current = share;
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const next = pendingShareRef.current;
        pendingShareRef.current = null;
        if (next !== null) onShareChange(next);
      });
    },
    [onShareChange],
  );

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    sessionRef.current = {
      pointerId: e.pointerId,
      axis,
      originX: e.clientX,
      originY: e.clientY,
      // The rect moves while dragging, so freeze the starting geometry.
      baseWidth: rect.width,
      baseHeight: rect.height,
    };
    setIsActive(true);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    const roomArea = roomWidth * roomHeight;
    if (roomArea <= 0) return;

    const width =
      axis === 'x'
        ? clamp(session.baseWidth + (e.clientX - session.originX), MIN_RESIZE_PX, roomWidth)
        : session.baseWidth;
    const height =
      axis === 'y'
        ? clamp(session.baseHeight + (e.clientY - session.originY), MIN_RESIZE_PX, roomHeight)
        : session.baseHeight;

    scheduleShare((width * height) / roomArea);
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    sessionRef.current = null;
    setIsActive(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    cancelFrame();
    onReset();
  }

  const highlighted = isActive || isHovered;
  const lineColor = highlighted ? tone.accent : tone.divider;
  const lineThickness = highlighted ? 3 : 2;

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={axis === 'x' ? 'Resize width' : 'Resize height'}
      title={isManual ? 'Drag to resize · double-click to restore automatic size' : 'Drag to resize'}
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
        cursor: axis === 'x' ? 'col-resize' : 'row-resize',
        display: 'flex',
        alignItems: axis === 'x' ? 'stretch' : 'flex-end',
        justifyContent: axis === 'x' ? 'flex-end' : 'stretch',
        ...(axis === 'x'
          ? { top: 0, right: 0, width: HANDLE_THICKNESS, height: '100%' }
          : { left: 0, bottom: 0, height: HANDLE_THICKNESS, width: '100%' }),
      }}
    >
      <div
        style={{
          background: lineColor,
          // A manually sized edge keeps a faint mark so the user can tell
          // which divider they set — loud enough to find, quiet enough to
          // not read as a border.
          opacity: highlighted ? 1 : isManual ? 0.45 : 0,
          transition: 'opacity 0.12s, background 0.12s',
          ...(axis === 'x'
            ? { width: lineThickness, height: '100%' }
            : { height: lineThickness, width: '100%' }),
        }}
      />
    </div>
  );
}

interface RoomResizeHandlesProps {
  kind: ResizeTargetKind;
  /** The node being resized, or — for `content` — the node the content belongs to. */
  nodeId: PaperId;
  /** The target's rect in room coordinates. */
  rect: LayoutRect;
  roomWidth: number;
  roomHeight: number;
  tone: PaperTone;
}

/**
 * Renders the grips for one rect inside a room. Only edges that face a sibling
 * get one: an edge flush against the room boundary has nothing to trade area
 * with, so grabbing it would do nothing.
 */
export function RoomResizeHandles({
  kind,
  nodeId,
  rect,
  roomWidth,
  roomHeight,
  tone,
}: RoomResizeHandlesProps) {
  const dispatch = usePaperDispatch();
  const isManual = usePaperStoreSelector(({ state }) =>
    (kind === 'node' ? state.manualSizeMap : state.manualContentSizeMap).get(nodeId) !== undefined,
  );

  const onShareChange = useCallback(
    (share: number) => {
      dispatch(
        kind === 'node'
          ? { type: 'RESIZE_NODE', nodeId, share }
          : { type: 'RESIZE_CONTENT', nodeId, share },
      );
    },
    [dispatch, kind, nodeId],
  );

  const onReset = useCallback(() => {
    dispatch(kind === 'node' ? { type: 'RESET_NODE_SIZE', nodeId } : { type: 'RESET_CONTENT_SIZE', nodeId });
  }, [dispatch, kind, nodeId]);

  if (rect.width < MIN_RESIZABLE_PX || rect.height < MIN_RESIZABLE_PX) return null;

  const hasRightNeighbor = rect.x + rect.width < roomWidth - EDGE_EPSILON;
  const hasBottomNeighbor = rect.y + rect.height < roomHeight - EDGE_EPSILON;
  if (!hasRightNeighbor && !hasBottomNeighbor) return null;

  const shared = { rect, roomWidth, roomHeight, isManual, tone, onShareChange, onReset };
  return (
    <>
      {hasRightNeighbor && <ResizeHandle axis="x" {...shared} />}
      {hasBottomNeighbor && <ResizeHandle axis="y" {...shared} />}
    </>
  );
}
