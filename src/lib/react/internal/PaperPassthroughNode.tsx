import { motion } from 'framer-motion';
import type { ComponentType } from 'react';
import type { DragControls, PanInfo } from 'framer-motion';
import PaperTopStrip from './PaperTopStrip';
import type { PaperId, PaperMap } from '../../core/types';
import type { PaperNodeProps } from './paperNodeTypes';

const lt = { duration: 0.45, ease: [0.4, 0, 0.2, 1] } as const;

interface Props {
  paperId: PaperId;
  mode: 'docked' | 'floating-duplicate';
  isRoot: boolean;
  isPrimary: boolean;
  singleDockedChildId: PaperId;
  childCrumbs: PaperId[];
  passthroughContextPathIds: PaperId[];
  shouldShowTopStrip: boolean;
  paperMap: PaperMap;
  getHue: (paperId: PaperId) => number | null;
  onContextChildClick: (childId: PaperId) => void;
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
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
  dragState: PaperNodeProps['dragState'];
  onDragStateChange: PaperNodeProps['onDragStateChange'];
  placementMap: PaperNodeProps['placementMap'];
  onRequestFloat: PaperNodeProps['onRequestFloat'];
  onFocusFloating: PaperNodeProps['onFocusFloating'];
  allowCrumbInteractions: boolean;
  allowHeaderInteractions: boolean;
  allowContextInteractions: boolean;
  depth: number;
}

export default function PaperPassthroughNode({
  paperId,
  mode,
  isRoot,
  isPrimary,
  singleDockedChildId,
  childCrumbs,
  passthroughContextPathIds,
  shouldShowTopStrip,
  paperMap,
  getHue,
  onContextChildClick,
  NodeComponent,
  nodeElementRef,
  dragHandlers,
  isDragCompact,
  dragSizeStyle,
  selectedContextId,
  onSelectContext,
  dragState,
  onDragStateChange,
  placementMap,
  onRequestFloat,
  onFocusFloating,
  allowCrumbInteractions,
  allowHeaderInteractions,
  allowContextInteractions,
  depth,
}: Props) {
  return (
    <motion.div
      ref={nodeElementRef}
      layoutId={nodePropsLayoutId(isRoot, mode, paperId)}
      layout
      initial={isRoot ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={isRoot ? undefined : { opacity: 0 }}
      transition={{ opacity: { duration: 0.22 }, layout: lt }}
      className={`paper-node paper-node--passthrough ${isDragCompact ? 'paper-node--dragging' : ''}`}
      drag={!isRoot && !!onRequestFloat}
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
      data-docked-paper-id={mode === 'docked' && !isRoot ? paperId : undefined}
    >
      {dragState.paperId === paperId && (
        <div
          className="paper-node__drag-ghost paper-node__drag-ghost--passthrough"
          aria-hidden="true"
          style={{ borderRadius: 14 }}
        />
      )}
      {shouldShowTopStrip && (
        <PaperTopStrip
          paperMap={paperMap}
          contextId={paperId}
          currentPathIds={passthroughContextPathIds}
          getHue={getHue}
          onChildClick={onContextChildClick}
          allowInteractions={allowContextInteractions}
        />
      )}
      <NodeComponent
        paperId={singleDockedChildId}
        parentId={paperId}
        mode={mode}
        isPrimary={true}
        depth={depth + 1}
        crumbs={childCrumbs}
        hue={getHue(singleDockedChildId)}
        selectedContextId={selectedContextId}
        onSelectContext={onSelectContext}
        dragState={dragState}
        onDragStateChange={onDragStateChange}
        placementMap={placementMap}
        onRequestFloat={onRequestFloat}
        onFocusFloating={onFocusFloating}
        allowCrumbInteractions={allowCrumbInteractions}
        allowHeaderInteractions={allowHeaderInteractions}
        allowContextInteractions={allowContextInteractions}
      />
    </motion.div>
  );
}

function nodePropsLayoutId(isRoot: boolean, mode: 'docked' | 'floating-duplicate', paperId: PaperId) {
  if (isRoot || mode !== 'docked') {
    return undefined;
  }
  return paperId;
}
