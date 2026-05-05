import { AnimatePresence, motion } from 'framer-motion';
import type { RefObject } from 'react';
import type { Paper, PaperId } from '../../core/types';
import type { RoomLayout } from '../hooks/usePaperLayout';
import type { PaperTone, PaperColorContext } from '../internal/paperColors';
import { PaperContentFrame } from './PaperContentFrame';
import { PaperHeader } from './PaperHeader';
import { PaperNode } from './PaperNode';

interface PaperNodeFrameProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  paper: Paper;
  layout: RoomLayout;
  tone: PaperTone;
  inheritedColor: PaperColorContext | null;
  overrideCss?: string;
  currentShare?: number;
  isFocused: boolean;
  isDragTarget: boolean;
  isContentIndexed: boolean;
  debugBadge?: string | null;
  roomRef: RefObject<HTMLDivElement | null>;
  insertBeforeRect?: { x: number; y: number; height: number } | null;
}

const POSITION_TRANSITION = { type: 'spring' as const, stiffness: 260, damping: 32, mass: 0.7 };

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
  isContentIndexed,
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
      {!isContentIndexed && (
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
        <motion.div
          animate={{
            x: layout.contentRect.x,
            y: layout.contentRect.y,
          }}
          transition={POSITION_TRANSITION}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: layout.contentRect.width,
            height: layout.contentRect.height,
            overflow: 'auto',
            borderRight: layout.childRects.size > 0 && !isContentIndexed ? `1px solid ${tone.divider}` : 'none',
            boxSizing: 'border-box',
            padding: isContentIndexed ? 0 : 10,
            color: tone.text,
            scrollbarWidth: 'thin',
            scrollbarColor: `${tone.divider} transparent`,
            pointerEvents: isContentIndexed ? 'none' : 'auto',
          }}
        >
          {!isContentIndexed && (
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
        </motion.div>

        <AnimatePresence>
          {Array.from(layout.childRects.entries()).map(([childId, rect]) => (
            <motion.div
              key={childId}
              data-child-id={childId}
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ x: rect.x, y: rect.y, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={POSITION_TRANSITION}
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
            </motion.div>
          ))}
        </AnimatePresence>

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
