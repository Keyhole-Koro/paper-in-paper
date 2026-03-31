import { motion } from 'framer-motion';
import type { ComponentType } from 'react';
import type { PanInfo } from 'framer-motion';
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
  };
  dragSizeStyle: React.CSSProperties | null;
  isReturnArmed: boolean;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
  dragState: PaperNodeProps['dragState'];
  onDragStateChange: PaperNodeProps['onDragStateChange'];
  placementMap: PaperNodeProps['placementMap'];
  onRequestFloat: PaperNodeProps['onRequestFloat'];
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
  dragSizeStyle,
  isReturnArmed,
  selectedContextId,
  onSelectContext,
  dragState,
  onDragStateChange,
  placementMap,
  onRequestFloat,
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
      className="paper-node paper-node--passthrough"
      drag={!isRoot && !!onRequestFloat}
      dragMomentum={false}
      dragElastic={0.08}
      onDragStart={dragHandlers.handleDragStart}
      onDrag={dragHandlers.handleDrag}
      onDragEnd={dragHandlers.handleDragEnd}
      whileDrag={{ scale: 1, zIndex: 20 }}
      style={{
        flex: isRoot ? 1 : isPrimary ? 2 : 1,
        ...(dragSizeStyle ?? {}),
      }}
    >
      {dragState.parentId === paperId && (
        <div
          data-return-parent-id={paperId}
          className={`paper-node__return-zone ${isReturnArmed ? 'paper-node__return-zone--active' : ''}`}
        >
          Drop to return to parent
        </div>
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
