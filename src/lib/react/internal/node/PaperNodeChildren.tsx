import { AnimatePresence } from 'framer-motion';
import type { ComponentType } from 'react';
import type { PaperId } from '../../../core/types';
import type { PaperNodeProps } from './paperNodeTypes';

interface Props {
  paperId: PaperId;
  primaryChildId: PaperId | null;
  openChildIds: PaperId[];
  closedChildIds: PaperId[];
  leafVisible: boolean;
  leafStyle: React.CSSProperties;
  getHue: (paperId: PaperId) => number | null;
  NodeComponent: ComponentType<PaperNodeProps>;
  dragState: PaperNodeProps['dragState'];
  onDragStateChange: PaperNodeProps['onDragStateChange'];
  onInsertDrop: PaperNodeProps['onInsertDrop'];
  allowCrumbInteractions: boolean;
  allowHeaderInteractions: boolean;
  depth: number;
  crumbs: PaperId[];
}

export default function PaperNodeChildren({
  paperId,
  primaryChildId,
  openChildIds,
  closedChildIds,
  leafVisible,
  leafStyle,
  getHue,
  NodeComponent,
  dragState,
  onDragStateChange,
  onInsertDrop,
  allowCrumbInteractions,
  allowHeaderInteractions,
  depth,
  crumbs,
}: Props) {
  return (
    <>
      {openChildIds.length > 0 && (
        <div className="paper-node__open-children" data-open-children-parent-id={paperId}>
          <AnimatePresence mode="popLayout" initial={false}>
            {openChildIds.map((childId) => (
              <NodeComponent
                key={childId}
                paperId={childId}
                parentId={paperId}
                nodeState="open"
                isPrimary={childId === primaryChildId}
                depth={depth + 1}
                crumbs={[]}
                hue={getHue(childId)}
                dragState={dragState}
                onDragStateChange={onDragStateChange}
                onInsertDrop={onInsertDrop}
                allowCrumbInteractions={allowCrumbInteractions}
                allowHeaderInteractions={allowHeaderInteractions}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
      {closedChildIds.length > 0 && (
        <div className="paper-node__closed-children">
          <AnimatePresence mode="popLayout" initial={false}>
            {closedChildIds.map((childId) => (
              <NodeComponent
                key={childId}
                paperId={childId}
                parentId={paperId}
                nodeState="closed"
                isPrimary={false}
                depth={depth + 1}
                crumbs={[...crumbs, paperId]}
                hue={getHue(childId)}
                dragState={dragState}
                onDragStateChange={onDragStateChange}
                onInsertDrop={onInsertDrop}
                allowCrumbInteractions={allowCrumbInteractions}
                allowHeaderInteractions={allowHeaderInteractions}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
      {leafVisible && (
        <div className="paper-node__leaf" style={leafStyle}>— leaf —</div>
      )}
    </>
  );
}
