import { AnimatePresence } from 'framer-motion';
import type { ComponentType } from 'react';
import ChildCard from './ChildCard';
import type { Paper, PaperId } from '../../core/types';
import type { PaperNodeProps } from './paperNodeTypes';

interface Props {
  paperId: PaperId;
  primaryChildId: PaperId | null;
  dockedOpenChildIds: PaperId[];
  closedChildren: Array<{ id: PaperId; paper: Paper; hue: number | null }>;
  leafVisible: boolean;
  leafStyle: React.CSSProperties;
  getHue: (paperId: PaperId) => number | null;
  NodeComponent: ComponentType<PaperNodeProps>;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
  dragState: PaperNodeProps['dragState'];
  onDragStateChange: PaperNodeProps['onDragStateChange'];
  placementMap: PaperNodeProps['placementMap'];
  onRequestFloat: PaperNodeProps['onRequestFloat'];
  onFocusFloating: PaperNodeProps['onFocusFloating'];
  floatingChildren: Array<{ id: PaperId; paper: Paper; hue: number | null }>;
  allowCrumbInteractions: boolean;
  allowHeaderInteractions: boolean;
  allowContextInteractions: boolean;
  depth: number;
  crumbs: PaperId[];
  onOpenChild: (childId: PaperId) => void;
}

export default function PaperNodeChildren({
  paperId,
  primaryChildId,
  dockedOpenChildIds,
  closedChildren,
  floatingChildren,
  leafVisible,
  leafStyle,
  getHue,
  NodeComponent,
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
  crumbs,
  onOpenChild,
}: Props) {
  return (
    <>
      {dockedOpenChildIds.length > 0 && (
        <div className="paper-node__open-children">
          <AnimatePresence mode="popLayout" initial={false}>
            {dockedOpenChildIds.map((childId) => (
              <NodeComponent
                key={childId}
                paperId={childId}
                parentId={paperId}
                mode="docked"
                isPrimary={childId === primaryChildId}
                depth={depth + 1}
                crumbs={[]}
                hue={getHue(childId)}
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
                onRequestFloat={onRequestFloat}
                onClick={() => onOpenChild(id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
      {floatingChildren.length > 0 && (
        <div className="paper-node__closed-children">
          <AnimatePresence mode="popLayout" initial={false}>
            {floatingChildren.map(({ id, paper, hue }) => (
              <ChildCard
                key={id}
                paper={paper}
                hue={hue}
                parentId={paperId}
                depth={depth + 1}
                crumbs={[...crumbs, paperId]}
                dragState={dragState}
                onDragStateChange={onDragStateChange}
                onRequestFloat={onRequestFloat}
                isFloating={true}
                onClick={() => onFocusFloating?.(id)}
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
