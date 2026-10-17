import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { NodeRoomLayout } from '../../core/layout';
import type { Paper, PaperId } from '../../core/types';
import type { NodeLayoutPolicy } from '../../core/nodeLayoutPolicy';
import type { PaperTone, PaperColorContext } from '../internal/paperColors';
import { PaperContentFrame } from './PaperContentFrame';
import { PaperHeader } from './PaperHeader';
import { PaperNode } from './PaperNode';

interface PaperNodeFrameProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  paper: Paper;
  layout: NodeRoomLayout;
  tone: PaperTone;
  inheritedColor: PaperColorContext | null;
  overrideCss?: string;
  currentShare?: number;
  isFocused: boolean;
  isDragTarget: boolean;
  layoutPolicy: NodeLayoutPolicy;
  debugBadge?: string | null;
  roomRef: RefObject<HTMLDivElement | null>;
  insertBeforeRect?: { x: number; y: number; height: number } | null;
}

const POSITION_TRANSITION = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
const ENTER_KEYFRAMES: Keyframe[] = [
  { opacity: 0, scale: '0.985' },
  { opacity: 1, scale: '1' },
];
const ENTER_TIMING: KeyframeAnimationOptions = { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * A box placed at (x, y). Moves glide with a CSS transition; with `enter`, the box fades and
 * scales in when it mounts (Web Animations API, so no animation library is needed). Both are
 * skipped when the user prefers reduced motion. Removed boxes disappear at once: animating an
 * exit would mean keeping unmounted children around, which is what framer-motion did for us.
 */
function AnimatedRect({
  x,
  y,
  enter = false,
  style,
  children,
  dataAttrs,
}: {
  x: number;
  y: number;
  enter?: boolean;
  style: CSSProperties;
  children: ReactNode;
  dataAttrs?: Record<string, string | undefined>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = prefersReducedMotion();

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
      style={{
        ...style,
        transform: `translate(${x}px, ${y}px)`,
        transition: reducedMotion ? undefined : POSITION_TRANSITION,
      }}
      {...dataAttrs}
    >
      {children}
    </div>
  );
}

export function PaperNodeFrame({
  nodeId,
  parentId,
  paper,
  layout,
  tone,
  inheritedColor,
  overrideCss,
  currentShare,
  isFocused,
  isDragTarget,
  layoutPolicy,
  debugBadge,
  roomRef,
  insertBeforeRect,
}: PaperNodeFrameProps) {
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
      {layoutPolicy.hasHeader && (
        <PaperHeader
          nodeId={nodeId}
          parentId={parentId}
          title={paper.title}
          tone={tone}
          isFocused={isFocused}
          isPinned={paper.pinnedLayout?.minShare !== undefined}
          currentShare={currentShare}
        />
      )}

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
        <AnimatedRect
          x={layout.contentRect.x}
          y={layout.contentRect.y}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: layout.contentRect.width,
            height: layout.contentRect.height,
            overflow: 'auto',
            borderRight: layout.childRects.size > 0 && layoutPolicy.hasContent ? `1px solid ${tone.divider}` : 'none',
            boxSizing: 'border-box',
            padding: layoutPolicy.hasContent ? 10 : 0,
            color: tone.text,
            scrollbarWidth: 'thin',
            scrollbarColor: `${tone.divider} transparent`,
            pointerEvents: layoutPolicy.hasContent ? 'auto' : 'none',
          }}
        >
          {layoutPolicy.hasContent && (
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
          )}
        </AnimatedRect>

        {Array.from(layout.childRects.entries()).map(([childId, rect]) => (
          <AnimatedRect
            key={childId}
            x={rect.x}
            y={rect.y}
            enter
            dataAttrs={{ 'data-child-id': childId }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: rect.width,
              height: rect.height,
              overflow: 'hidden',
              borderLeft: `1px solid ${tone.divider}`,
              borderTop: rect.y > 0 ? `1px solid ${tone.divider}` : 'none',
              boxSizing: 'border-box',
            }}
          >
            <PaperNode nodeId={childId} parentId={nodeId} inheritedColor={inheritedColor} overrideCss={overrideCss} />
          </AnimatedRect>
        ))}

        {insertBeforeRect && (
          <div
            style={{
              position: 'absolute',
              left: insertBeforeRect.x,
              top: insertBeforeRect.y,
              width: 2,
              height: insertBeforeRect.height,
              background: tone.accent,
              borderRadius: 1,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}

        {debugBadge && (
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
            {debugBadge}
          </div>
        )}
      </div>
    </div>
  );
}
