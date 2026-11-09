import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { CHILD_DIVIDER_PX, type LayoutRect, type NodeLayoutEntry } from '../../core/layout';
import type { Paper, PaperId } from '../../core/types';
import { useCanvasOptions } from '../context/CanvasOptionsContext';
import { useDragStore, useDragValue } from '../drag/dragContext';
import { useReducedMotion } from '../hooks/useMediaQuery';
import { placeChildren } from '../internal/childOrder';
import type { PaperColorContext, PaperTone } from '../internal/paperColors';
import { useStoreValue } from '../store/storeContext';
import { PaperContentFrame } from './PaperContentFrame';
import { PaperHeader } from './PaperHeader';
import { PaperNode } from './PaperNode';

const MOTION = '0.28s cubic-bezier(0.22, 1, 0.36, 1)';
const RECT_TRANSITION = `transform ${MOTION}, width ${MOTION}, height ${MOTION}`;
const ENTER_KEYFRAMES: Keyframe[] = [
  { opacity: 0, scale: '0.985' },
  { opacity: 1, scale: '1' },
];
const ENTER_TIMING: KeyframeAnimationOptions = { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

/**
 * A box placed at (x, y) with the given size. Position and size glide together with a CSS
 * transition; with `enter`, the box fades and scales in when it mounts (Web Animations API).
 * Both are skipped when the reader prefers reduced motion.
 */
function AnimatedRect({
  rect,
  enter = false,
  style,
  children,
  childId,
  childIndex,
}: {
  rect: LayoutRect;
  enter?: boolean;
  style: CSSProperties;
  children: ReactNode;
  childId?: PaperId;
  /** The child's place in the room's layout order (its DOM position does not follow it). */
  childIndex?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    if (!enter || reducedMotion) return;
    // `scale` is its own property, so it does not fight the translate in `transform`.
    ref.current?.animate?.(ENTER_KEYFRAMES, ENTER_TIMING);
    // Only on mount: later renders are moves, not entrances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      data-child-id={childId}
      data-child-index={childIndex}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: rect.width,
        height: rect.height,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        transition: reducedMotion ? undefined : RECT_TRANSITION,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const INDICATOR = 2;

/** Where the insert line goes for a drop before `insertBeforeId` (null: after the last child). */
function indicatorStyle(entry: NodeLayoutEntry, insertBeforeId: PaperId | null): CSSProperties | null {
  const rects = Array.from(entry.roomLayout.childRects.values()).filter((r) => r.width > 0 && r.height > 0);
  if (rects.length === 0) return null;
  const before = insertBeforeId === null ? null : entry.roomLayout.childRects.get(insertBeforeId) ?? null;
  const rect = before ?? rects[rects.length - 1];
  const vertical = rect.width >= rect.height;
  if (vertical) {
    const x = before ? rect.x : rect.x + rect.width - INDICATOR;
    return { left: x, top: rect.y, width: INDICATOR, height: rect.height };
  }
  const y = before ? rect.y : rect.y + rect.height - INDICATOR;
  return { left: rect.x, top: y, width: rect.width, height: INDICATOR };
}

function DebugBadge({ nodeId, entry }: { nodeId: PaperId; entry: NodeLayoutEntry }) {
  const attention = useStoreValue((snapshot) => Math.round(snapshot.layout.demand.effectiveAttentionMap.get(nodeId) ?? 0));
  const pinned = useStoreValue((snapshot) => snapshot.state.paperMap.get(nodeId)?.pinnedLayout?.minShare !== undefined);
  const { width, height } = entry.allocatedRect;
  return (
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
      {`${nodeId} • att ${attention} • ${width}×${height} • ${entry.policy.mode}${pinned ? ' • pinned' : ''}`}
    </div>
  );
}

interface PaperNodeFrameProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  paper: Paper;
  entry: NodeLayoutEntry;
  tone: PaperTone;
  color: PaperColorContext;
  isFocused: boolean;
  headerHeight: number;
}

export function PaperNodeFrame({
  nodeId,
  parentId,
  paper,
  entry,
  tone,
  color,
  isFocused,
  headerHeight,
}: PaperNodeFrameProps) {
  const { debug } = useCanvasOptions();
  const dragStore = useDragStore();
  const dropTarget = useDragValue((drag) => (drag.insertTarget?.parentId === nodeId ? drag.insertTarget : null));
  const { policy, roomLayout } = entry;

  const roomRef = useCallback((el: HTMLDivElement | null) => {
    dragStore.registerRoom(nodeId, el);
    return () => dragStore.registerRoom(nodeId, null);
  }, [dragStore, nodeId]);

  const indicator = dropTarget ? indicatorStyle(entry, dropTarget.insertBeforeId) : null;
  const placed = useMemo(() => placeChildren(paper.childIds, roomLayout.childRects), [paper.childIds, roomLayout.childRects]);

  return (
    <div
      data-paper-id-frame={nodeId}
      style={{
        position: 'absolute',
        inset: 0,
        border: `1px solid ${isFocused ? tone.accent : tone.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        background: tone.background,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {policy.hasHeader && (
        <PaperHeader
          nodeId={nodeId}
          parentId={parentId}
          title={paper.title}
          tone={tone}
          isFocused={isFocused}
          isPinned={paper.pinnedLayout?.minShare !== undefined}
          height={headerHeight}
        />
      )}

      <div
        ref={roomRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          outline: dropTarget ? `2px dashed ${tone.accent}` : '2px dashed transparent',
          outlineOffset: -2,
          transition: 'outline-color 0.1s',
        }}
      >
        <AnimatedRect
          rect={roomLayout.contentRect}
          style={{
            overflow: 'auto',
            borderRight: roomLayout.childRects.size > 0 && policy.hasContent ? `1px solid ${tone.divider}` : 'none',
            padding: policy.hasContent ? 10 : 0,
            color: tone.text,
            scrollbarWidth: 'thin',
            scrollbarColor: `${tone.divider} transparent`,
            pointerEvents: policy.hasContent ? 'auto' : 'none',
          }}
        >
          {policy.hasContent && <PaperContentFrame nodeId={nodeId} paper={paper} tone={tone} />}
        </AnimatedRect>

        {placed.map(({ id: childId, rect, index }) => (
          <AnimatedRect
            key={childId}
            rect={rect}
            enter
            childId={childId}
            childIndex={index}
            style={{
              overflow: 'hidden',
              borderLeft: `${CHILD_DIVIDER_PX}px solid ${tone.divider}`,
              borderTop: rect.y > 0 ? `${CHILD_DIVIDER_PX}px solid ${tone.divider}` : 'none',
            }}
          >
            <PaperNode nodeId={childId} parentId={nodeId} inheritedColor={color} />
          </AnimatedRect>
        ))}

        {indicator && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              ...indicator,
              background: tone.accent,
              borderRadius: 1,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}

        {debug && <DebugBadge nodeId={nodeId} entry={entry} />}
      </div>
    </div>
  );
}
