import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { PaperId } from '../../../../core/types';
import { useLayout } from '../../layout/LayoutContext';
import type { PaperNodeProps } from '../utils/paperNodeTypes';
import { computeGridMetrics, computeRowSpan, SIZE_SPANS } from '../utils/layoutHelpers';

interface Props {
  paperId: PaperId;
  hue: number | null;
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

function useMeasuredGridMetrics(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridMetrics, setGridMetrics] = useState(() => computeGridMetrics(700));

  useEffect(() => {
    const el = containerRef.current;
    if (!active || !el) return;

    const updateMetrics = (width: number) => {
      setGridMetrics(computeGridMetrics(width));
    };

    updateMetrics(el.getBoundingClientRect().width);

    const ro = new ResizeObserver(([entry]) => {
      updateMetrics(entry.contentRect.width);
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [active]);

  return { containerRef, gridMetrics };
}

export default function PaperNodeChildren({
  paperId,
  hue,
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
  const { getSize } = useLayout();
  const { containerRef: openChildrenRef, gridMetrics: openGridMetrics } = useMeasuredGridMetrics(openChildIds.length > 0);
  const { containerRef: closedChildrenRef, gridMetrics: closedGridMetrics } = useMeasuredGridMetrics(closedChildIds.length > 0);
  const [childRowSpanMap, setChildRowSpanMap] = useState<Map<PaperId, number>>(new Map());
  const gridHue = hue === null ? 220 : (hue + depth * 18) % 360;
  const gridLineX = `hsla(${gridHue}, 88%, 50%, 0.36)`;
  const gridLineY = `hsla(${gridHue}, 82%, 46%, 0.28)`;
  const gridOutline = `hsla(${gridHue}, 80%, 42%, 0.65)`;

  return (
    <>
      {openChildIds.length > 0 && (
        <div
          ref={openChildrenRef}
          className="paper-node__open-children"
          data-open-children-parent-id={paperId}
          style={{
            ['--paper-open-children-columns' as string]: String(openGridMetrics.columns),
            ['--paper-open-children-row-height' as string]: `${openGridMetrics.rowHeight}px`,
            ['--paper-grid-columns' as string]: String(openGridMetrics.columns),
            ['--paper-grid-row-height' as string]: `${openGridMetrics.rowHeight}px`,
            ['--paper-grid-line-x' as string]: gridLineX,
            ['--paper-grid-line-y' as string]: gridLineY,
            ['--paper-grid-outline' as string]: gridOutline,
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {openChildIds.map((childId) => (
              (() => {
                const size = getSize(childId);
                const baseSpan = SIZE_SPANS[size];
                const rowSpan = childRowSpanMap.get(childId) ?? baseSpan.row;

                return (
              <NodeComponent
                key={childId}
                paperId={childId}
                parentId={paperId}
                nodeState="open"
                isPrimary={childId === primaryChildId}
                depth={depth + 1}
                crumbs={[...crumbs, paperId]}
                hue={getHue(childId)}
                gridColumnSpan={baseSpan.col}
                gridRowSpan={rowSpan}
                onMeasuredHeight={(id, height) => {
                  const nextRowSpan = computeRowSpan(height, openGridMetrics.rowHeight, baseSpan.row);
                  setChildRowSpanMap((prev) => {
                    if (prev.get(id) === nextRowSpan) return prev;
                    const next = new Map(prev);
                    next.set(id, nextRowSpan);
                    return next;
                  });
                }}
                dragState={dragState}
                onDragStateChange={onDragStateChange}
                onInsertDrop={onInsertDrop}
                allowCrumbInteractions={allowCrumbInteractions}
                allowHeaderInteractions={allowHeaderInteractions}
              />
                );
              })()
            ))}
          </AnimatePresence>
        </div>
      )}
      {closedChildIds.length > 0 && (
        <div
          ref={closedChildrenRef}
          className="paper-node__closed-children"
          style={{
            ['--paper-closed-children-columns' as string]: String(closedGridMetrics.columns),
            ['--paper-closed-children-row-height' as string]: `${closedGridMetrics.rowHeight}px`,
            ['--paper-grid-columns' as string]: String(closedGridMetrics.columns),
            ['--paper-grid-row-height' as string]: `${closedGridMetrics.rowHeight}px`,
            ['--paper-grid-line-x' as string]: gridLineX,
            ['--paper-grid-line-y' as string]: gridLineY,
            ['--paper-grid-outline' as string]: gridOutline,
          }}
        >
          <AnimatePresence initial={false}>
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
