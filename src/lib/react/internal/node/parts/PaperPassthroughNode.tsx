import { motion, type DragControls, type PanInfo } from 'framer-motion';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { PaperId } from '../../../../core/types';

interface Props {
  paperId: PaperId;
  nodeElementRef: RefObject<HTMLElement | null>;
  gridColumnSpan?: number;
  gridRowSpan?: number;
  isDragCompact: boolean;
  isDragging: boolean;
  dragSizeStyle: CSSProperties | null;
  dragControls: DragControls;
  stickyPointerDown: (e: React.PointerEvent) => void;
  handleDragStart: () => void;
  handleDrag: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  handleDragEnd: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  children: ReactNode;
}

export default function PaperPassthroughNode({
  paperId,
  nodeElementRef,
  gridColumnSpan,
  gridRowSpan,
  isDragCompact,
  isDragging,
  dragSizeStyle,
  dragControls,
  stickyPointerDown,
  handleDragStart,
  handleDrag,
  handleDragEnd,
  children,
}: Props) {
  return (
    <motion.div
      ref={nodeElementRef as RefObject<HTMLDivElement>}
      layout="position"
      className={[
        'paper-node',
        'paper-node--passthrough',
        isDragCompact ? 'paper-node--dragging' : '',
      ].join(' ')}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.08}
      onPointerDown={stickyPointerDown}
      onDragStart={handleDragStart}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      whileDrag={{ scale: 1, zIndex: 20 }}
      transition={{ opacity: { duration: 0.22 }, layout: { duration: 0.22, ease: [0.2, 0, 0.2, 1] } }}
      style={{
        gridColumn: `span ${gridColumnSpan ?? 1}`,
        gridRow: `span ${gridRowSpan ?? 1}`,
        position: 'relative',
        zIndex: 1,
        ...(dragSizeStyle ?? {}),
      }}
      data-docked-paper-id={paperId}
    >
      {isDragging && (
        <div
          className="paper-node__drag-ghost paper-node__drag-ghost--passthrough"
          aria-hidden="true"
          style={{ borderRadius: 14 }}
        />
      )}
      {children}
    </motion.div>
  );
}
