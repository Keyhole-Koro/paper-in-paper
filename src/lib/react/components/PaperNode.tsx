import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PaperId } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import { useDebug } from '../context/DebugContext';
import { useLayoutContext } from '../context/LayoutContext';
import type { RoomLayout } from '../hooks/usePaperLayout';
import {
  getPaperTone,
  resolvePaperColorContext,
  type PaperColorContext,
} from '../internal/paperColors';
import { PaperContentFrame } from './PaperContentFrame';
import { PaperHeader } from './PaperHeader';

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
  overrideCss?: string;
}

export function PaperNode({ nodeId, parentId, inheritedColor = null, overrideCss }: PaperNodeProps) {
  const { state } = usePaperStore();
  const { session, insertTarget, registerRoom } = useDrag();
  const roomRef = useRef<HTMLDivElement>(null);
  const debug = useDebug();

  const layoutMap = useLayoutContext();
  const entry = layoutMap.get(nodeId);
  const layout = entry?.roomLayout ?? FALLBACK_LAYOUT;
  const paper = state.paperMap.get(nodeId);
  const isRoot = parentId === null;

  useEffect(() => {
    registerRoom(nodeId, roomRef.current);
    return () => registerRoom(nodeId, null);
  }, [nodeId, registerRoom]);

  if (entry?.hidden) return null;
  if (!paper) return null;

  const isFocused = state.focusedNodeId === nodeId;
  const isDragTarget = session !== null && insertTarget?.parentId === nodeId;
  const color = resolvePaperColorContext(paper.hue, inheritedColor);
  const tone = getPaperTone(color, { isRoot, isFocused });

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
      <PaperHeader nodeId={nodeId} parentId={parentId} title={paper.title} tone={tone} isFocused={isFocused} />

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
            overrideCss={paper.overrideCss ?? overrideCss}
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
              <PaperNode nodeId={childId} parentId={nodeId} inheritedColor={color} overrideCss={overrideCss} />
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

        {/* debug badge */}
        {debug && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              zIndex: 20,
              background: 'rgba(0,0,0,0.72)',
              color: '#0f0',
              fontFamily: 'monospace',
              fontSize: 10,
              lineHeight: 1.3,
              padding: '2px 5px',
              borderRadius: 4,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              maxWidth: 'calc(100% - 8px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {`${nodeId} • imp ${Math.round(state.importanceMap.get(nodeId) ?? 0)} • ${entry?.allocatedRect.width ?? 0}×${entry?.allocatedRect.height ?? 0}`}
          </div>
        )}
      </div>

    </div>
  );
}
