import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PaperId } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import { useDebug } from '../context/DebugContext';
import { useCreateChild } from '../context/CreateChildContext';
import { useLayoutContext } from '../context/LayoutContext';
import type { RoomLayout } from '../hooks/usePaperLayout';
import {
  getPaperTone,
  resolvePaperColorContext,
  type PaperColorContext,
} from '../internal/paperColors';
import { PaperContentFrame } from './PaperContentFrame';

const DRAG_THRESHOLD = 5;

const HEADER_HEIGHT = 37;

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 0.8 };

const FALLBACK_LAYOUT: RoomLayout = {
  contentRect: { id: '__content__', x: 0, y: 0, width: 0, height: 0 },
  childRects: new Map(),
  closedChildIds: [],
};

interface PaperNodeProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  inheritedColor?: PaperColorContext | null;
}

export function PaperNode({ nodeId, parentId, inheritedColor = null }: PaperNodeProps) {
  const { state, dispatch } = usePaperStore();
  const { session, insertTarget, startDrag, registerRoom } = useDrag();
  const roomRef = useRef<HTMLDivElement>(null);
  const debug = useDebug();
  const onCreateChild = useCreateChild();

  const layoutMap = useLayoutContext();
  const entry = layoutMap.get(nodeId);
  const layout = entry?.roomLayout ?? FALLBACK_LAYOUT;
  const allocatedHeight = entry?.allocatedRect.height ?? 0;
  const roomHeight = Math.max(0, allocatedHeight - HEADER_HEIGHT);

  const paper = state.paperMap.get(nodeId);
  const isRoot = parentId === null;

  useEffect(() => {
    registerRoom(nodeId, roomRef.current);
    return () => registerRoom(nodeId, null);
  }, [nodeId, registerRoom]);

  // header drag state
  const headerPointerDown = useRef<{ x: number; y: number } | null>(null);
  const headerDidDrag = useRef(false);

  if (!paper) return null;

  const isFocused = state.focusedNodeId === nodeId;
  const isDragTarget = session !== null && insertTarget?.parentId === nodeId;
  const color = resolvePaperColorContext(paper.hue, inheritedColor);
  const tone = getPaperTone(color, { isRoot, isFocused });

  // --- header interaction ---
  function handleHeaderPointerDown(e: React.PointerEvent) {
    if (isRoot || e.button !== 0) return;
    headerPointerDown.current = { x: e.clientX, y: e.clientY };
    headerDidDrag.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleHeaderPointerMove(e: React.PointerEvent) {
    if (!headerPointerDown.current || headerDidDrag.current) return;
    const dx = e.clientX - headerPointerDown.current.x;
    const dy = e.clientY - headerPointerDown.current.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      headerDidDrag.current = true;
      startDrag(
        { draggedPaperId: nodeId, sourceParentId: parentId!, mode: 'move-parent', draggedTitle: paper!.title },
        { x: e.clientX, y: e.clientY },
      );
    }
  }

  function handleAddChild(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onCreateChild) return;
    onCreateChild(nodeId, ({ title, content, description = '', hue }) => {
      dispatch({ type: 'CREATE_CHILD_NODE', parentId: nodeId, title, content, description, hue });
    });
  }

  function stopHeaderPointerEvent(e: React.PointerEvent) {
    e.stopPropagation();
  }

  function handleHeaderPointerUp() {
    if (!headerDidDrag.current) {
      dispatch({ type: 'FOCUS_NODE', nodeId });
      if (!isRoot) {
        dispatch({ type: 'CLOSE_NODE', parentId: parentId!, childId: nodeId });
      }
    }
    headerPointerDown.current = null;
    headerDidDrag.current = false;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        border: `1px solid ${isFocused ? tone.accent : tone.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: tone.background,
        display: 'flex',
        flexDirection: 'column',
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
          background: isFocused ? tone.headerBackgroundFocused : tone.headerBackground,
          borderBottom: `1px solid ${tone.divider}`,
          cursor: isRoot ? 'default' : 'grab',
          userSelect: 'none',
          flexShrink: 0,
          boxSizing: 'border-box',
          touchAction: 'none',
          minWidth: 0, // Ensure flex child can shrink
        }}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerUp}
      >
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
          {paper.title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {onCreateChild && (
            <button
              type="button"
              onPointerDown={stopHeaderPointerEvent}
              onPointerUp={stopHeaderPointerEvent}
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
          {!isRoot && <span style={{ fontSize: 11, color: tone.mutedText }}>✕</span>}
        </div>
      </div>

      {/* room: 絶対配置で content + open children を 2D 配置 */}
      <div
        ref={roomRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          outline: isDragTarget ? `2px dashed ${tone.accent}` : '2px dashed transparent',
          transition: 'outline 0.1s',
        }}
      >
        {/* content */}
        <motion.div
          animate={{
            x: layout.contentRect.x,
            y: layout.contentRect.y,
            width: layout.contentRect.width,
            height: layout.contentRect.height,
          }}
          transition={SPRING}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            overflow: 'auto',
            borderRight: layout.childRects.size > 0 ? `1px solid ${tone.divider}` : 'none',
            boxSizing: 'border-box',
            padding: 10,
            color: tone.text,
            scrollbarWidth: 'thin',
            scrollbarColor: `${tone.divider} transparent`,
          }}
        >
          <PaperContentFrame
            nodeId={nodeId}
            content={paper.content}
            theme={{
              surface: tone.background,
              surfaceAlt: tone.backgroundHover,
              surfaceRaised: tone.headerBackground,
              text: tone.text,
              mutedText: tone.mutedText,
              divider: tone.divider,
              linkBackground: tone.headerBackground,
              linkBackgroundHover: tone.backgroundHover,
              linkBorder: tone.border,
              linkText: tone.title,
            }}
          />
        </motion.div>

        {/* open children */}
        <AnimatePresence>
          {Array.from(layout.childRects.entries()).map(([childId, rect]) => (
            <motion.div
              key={childId}
              data-child-id={childId}
              initial={{ opacity: 0, scale: 0.95, x: rect.x, y: rect.y, width: rect.width, height: rect.height }}
              animate={{ opacity: 1, scale: 1, x: rect.x, y: rect.y, width: rect.width, height: rect.height }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                overflow: 'hidden',
                borderLeft: `1px solid ${tone.divider}`,
                borderTop: rect.y > 0 ? `1px solid ${tone.divider}` : 'none',
                boxSizing: 'border-box',
              }}
            >
              <PaperNode nodeId={childId} parentId={nodeId} inheritedColor={color} />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* drop indicator for open children */}
        {isDragTarget && insertTarget?.insertBeforeId && layout.childRects.has(insertTarget.insertBeforeId) && (() => {
          const r = layout.childRects.get(insertTarget.insertBeforeId)!;
          return (
            <div
              style={{
                position: 'absolute',
                left: r.x,
                top: r.y,
                width: 2,
                height: r.height,
                background: tone.accent,
                borderRadius: 1,
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          );
        })()}

        {/* debug overlay */}
        {debug && (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              right: 4,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.72)',
              color: '#0f0',
              fontFamily: 'monospace',
              fontSize: 10,
              lineHeight: 1.6,
              padding: '4px 6px',
              borderRadius: 4,
              pointerEvents: 'none',
              whiteSpace: 'pre',
            }}
          >
            {`id: ${nodeId}
allocated: ${entry?.allocatedRect.width ?? 0}×${entry?.allocatedRect.height ?? 0} (inner h: ${roomHeight})
content: x${layout.contentRect.x} y${layout.contentRect.y} ${layout.contentRect.width}×${layout.contentRect.height}
contentHeight(reported): ${state.contentHeightMap.get(nodeId) ?? 'none'}
importance: ${Math.round(state.importanceMap.get(nodeId) ?? 0)}
children: ${layout.childRects.size} open / ${layout.closedChildIds.length} closed`}
          </div>
        )}
      </div>

    </div>
  );
}
