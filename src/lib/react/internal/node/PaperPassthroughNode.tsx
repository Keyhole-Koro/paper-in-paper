import { motion } from 'framer-motion';
import type { ComponentType } from 'react';
import type { DragControls, PanInfo } from 'framer-motion';
import type { PaperId } from '../../../core/types';
import type { PaperNodeProps } from './paperNodeTypes';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;

interface Props {
  paperId: PaperId;
  isRoot: boolean;
  isPrimary: boolean;
  singleOpenChildId: PaperId;
  getHue: (paperId: PaperId) => number | null;
  NodeComponent: ComponentType<PaperNodeProps>;
  nodeElementRef: React.RefObject<HTMLDivElement | null>;
  dragHandlers: {
    handleDragStart: () => void;
    handleDrag: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    handleDragEnd: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    dragControls: DragControls;
    stickyPointerDown: (e: React.PointerEvent) => void;
  };
  isDragCompact: boolean;
  dragSizeStyle: React.CSSProperties | null;
  dragState: PaperNodeProps['dragState'];
  onDragStateChange: PaperNodeProps['onDragStateChange'];
  onInsertDrop: PaperNodeProps['onInsertDrop'];
  allowCrumbInteractions: boolean;
  allowHeaderInteractions: boolean;
  depth: number;
  crumbs: PaperId[];
}

export default function PaperPassthroughNode({
  paperId,
  isRoot,
  isPrimary,
  singleOpenChildId,
  getHue,
  NodeComponent,
  nodeElementRef,
  dragHandlers,
  isDragCompact,
  dragSizeStyle,
  dragState,
  onDragStateChange,
  onInsertDrop,
  allowCrumbInteractions,
  allowHeaderInteractions,
  depth,
  crumbs,
}: Props) {
  return (
    <motion.div
      ref={nodeElementRef}
      layoutId={!isRoot ? paperId : undefined}
      layout
      initial={isRoot ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={isRoot ? undefined : { opacity: 0 }}
      transition={{ opacity: { duration: 0.22 }, layout: lt }}
      className={`paper-node paper-node--passthrough ${isDragCompact ? 'paper-node--dragging' : ''}`}
      drag={!isRoot}
      dragListener={false}
      dragControls={dragHandlers.dragControls}
      dragMomentum={false}
      dragElastic={0.08}
      onPointerDown={dragHandlers.stickyPointerDown}
      onDragStart={dragHandlers.handleDragStart}
      onDrag={dragHandlers.handleDrag}
      onDragEnd={dragHandlers.handleDragEnd}
      whileDrag={{ scale: 1, zIndex: 20 }}
      style={{
        flex: isRoot ? 1 : isPrimary ? 2 : 1,
        ...(dragSizeStyle ?? {}),
      }}
      data-docked-paper-id={!isRoot ? paperId : undefined}
    >
      {dragState.paperId === paperId && (
        <div
          className="paper-node__drag-ghost paper-node__drag-ghost--passthrough"
          aria-hidden="true"
          style={{ borderRadius: 14 }}
        />
      )}
      <NodeComponent
        paperId={singleOpenChildId}
        parentId={paperId}
        isPrimary={true}
        depth={depth + 1}
        crumbs={[...crumbs, paperId]}
        hue={getHue(singleOpenChildId)}
        dragState={dragState}
        onDragStateChange={onDragStateChange}
        onInsertDrop={onInsertDrop}
        allowCrumbInteractions={allowCrumbInteractions}
        allowHeaderInteractions={allowHeaderInteractions}
      />
    </motion.div>
  );
}

