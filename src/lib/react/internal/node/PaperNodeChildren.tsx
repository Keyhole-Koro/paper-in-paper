import { AnimatePresence } from 'framer-motion';
import type { ComponentType } from 'react';
import ChildCard from '../cards/ChildCard';
import type { Paper, PaperId } from '../../../core/types';
import type { PaperNodeProps } from './paperNodeTypes';

interface Props {
  paperId: PaperId;
  primaryChildId: PaperId | null;
  openChildIds: PaperId[];
  closedChildren: Array<{ id: PaperId; paper: Paper; hue: number | null }>;
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
  onOpenChild: (childId: PaperId) => void;
}

export default function PaperNodeChildren({
  paperId,
  primaryChildId,
  openChildIds,
  closedChildren,
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
  onOpenChild,
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
      {closedChildren.length > 0 && (
        <div className="paper-node__closed-children">
          <AnimatePresence mode="popLayout" initial={false}>
            {closedChildren.map(({ id, paper, hue }) => (
              <ChildCard
                key={id}
                paper={paper}
                hue={hue}
                parentId={paperId}
                depth={depth + 1}
                crumbs={[...crumbs, paperId]}
                dragState={dragState}
                onDragStateChange={onDragStateChange}
                onInsertDrop={onInsertDrop}
                onClick={() => onOpenChild(id)}
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
