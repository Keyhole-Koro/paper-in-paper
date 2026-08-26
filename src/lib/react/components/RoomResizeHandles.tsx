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
type ResizeEdge = 'left' | 'right' | 'top' | 'bottom';

/**
 * A divider is shared by the two rects it separates, so it carries a grip on
 * each side. Each grip resizes the rect it belongs to: dragging away from that
 * rect grows it, dragging into it shrinks it. Either way the divider follows
 * the pointer, so which side the user grabbed does not change the outcome.
 */
const EDGE_AXIS: Record<ResizeEdge, 'x' | 'y'> = {
  left: 'x',
  right: 'x',
  top: 'y',
  bottom: 'y',
};

/** Which way the pointer has to travel for the rect to grow. */
const EDGE_GROW_SIGN: Record<ResizeEdge, 1 | -1> = {
  left: -1,
  top: -1,
  right: 1,
  bottom: 1,
};

interface DragSession {
  pointerId: number;
  originX: number;
  originY: number;
  /**
   * Geometry the drag is measured against. Null until the room has snapped
   * into its single-axis split — see handlePointerDown.
   */
  base: { width: number; height: number } | null;
  /** Rect size at pointer-down, used to notice when that snap has landed. */
  downWidth: number;
  downHeight: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

interface ResizeHandleProps {
  edge: ResizeEdge;
  rect: LayoutRect;
  roomWidth: number;
  roomHeight: number;
  /** Whether the room is already laid out as a single-axis split. */
  singleAxis: boolean;
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
  edge,
  rect,
  roomWidth,
  roomHeight,
  singleAxis,
  isManual,
  tone,
  onShareChange,
  onReset,
}: ResizeHandleProps) {
  const axis = EDGE_AXIS[edge];
  const grow = EDGE_GROW_SIGN[edge];
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
    const roomArea = roomWidth * roomHeight;
    sessionRef.current = {
      pointerId: e.pointerId,
      originX: e.clientX,
      originY: e.clientY,
      // The rect moves while dragging, so freeze the starting geometry — but
      // only once the room is in split mode. A packed room snaps into that
      // split the moment it gets its first manual share, and measuring the
      // drag against the packed geometry would send the edge the wrong way.
      base: singleAxis ? { width: rect.width, height: rect.height } : null,
      downWidth: rect.width,
      downHeight: rect.height,
    };
    setIsActive(true);
    if (!singleAxis && roomArea > 0) {
      // Same size as now, so nothing visibly resizes — this only asks the room
      // to switch to its split layout before the pointer starts moving.
      onShareChange((rect.width * rect.height) / roomArea);
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const session = sessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    const roomArea = roomWidth * roomHeight;
    if (roomArea <= 0) return;

    if (session.base === null) {
      // Still waiting for the snap-to-split relayout. Once the rect moves,
      // re-base the drag on the new geometry and start measuring from here.
      if (rect.width === session.downWidth && rect.height === session.downHeight) return;
      session.base = { width: rect.width, height: rect.height };
      session.originX = e.clientX;
      session.originY = e.clientY;
      return;
    }

    const width =
      axis === 'x'
        ? clamp(session.base.width + grow * (e.clientX - session.originX), MIN_RESIZE_PX, roomWidth)
        : session.base.width;
    const height =
      axis === 'y'
        ? clamp(session.base.height + grow * (e.clientY - session.originY), MIN_RESIZE_PX, roomHeight)
        : session.base.height;

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
      data-resize-edge={edge}
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
        // Keep the painted line pinned to the edge the grip sits on.
        alignItems: axis === 'x' ? 'stretch' : edge === 'top' ? 'flex-start' : 'flex-end',
        justifyContent: axis === 'x' ? (edge === 'left' ? 'flex-start' : 'flex-end') : 'stretch',
        ...(axis === 'x'
          ? { top: 0, [edge]: 0, width: HANDLE_THICKNESS, height: '100%' }
          : { left: 0, [edge]: 0, height: HANDLE_THICKNESS, width: '100%' }),
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
  /** Whether the room is already laid out as a single-axis split. */
  singleAxis: boolean;
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
  singleAxis,
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

  const interiorEdges: ResizeEdge[] = [];
  if (rect.x > EDGE_EPSILON) interiorEdges.push('left');
  if (rect.x + rect.width < roomWidth - EDGE_EPSILON) interiorEdges.push('right');
  if (rect.y > EDGE_EPSILON) interiorEdges.push('top');
  if (rect.y + rect.height < roomHeight - EDGE_EPSILON) interiorEdges.push('bottom');

  // A rect sized up far enough can squeeze its siblings until the space
  // manager indexes them away — and then it is flush on every edge with no
  // grip left to undo it. Keep a grip on a manually sized rect regardless, so
  // the user can always drag the space back or double-click to reset.
  const edges =
    interiorEdges.length > 0 ? interiorEdges : isManual ? (['right', 'bottom'] as ResizeEdge[]) : [];
  if (edges.length === 0) return null;

  const shared = { rect, roomWidth, roomHeight, singleAxis, isManual, tone, onShareChange, onReset };
  return (
    <>
      {edges.map((edge) => (
        <ResizeHandle key={edge} edge={edge} {...shared} />
      ))}
    </>
  );
}
