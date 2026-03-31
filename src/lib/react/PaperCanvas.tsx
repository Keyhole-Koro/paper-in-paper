import { LayoutGroup } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId, PaperMap } from '../core/types';
import { findRootId } from '../core/tree';
import PaperNode from './internal/PaperNode';
import FloatingLayer from './internal/FloatingLayer';
import { StoreProvider } from './internal/store';

export interface DragState {
  paperId: PaperId | null;
  parentId: PaperId | null;
  returnParentId: PaperId | null;
  point: { x: number; y: number } | null;
}

export interface FloatingPlacement {
  mode: 'floating';
  x: number;
  y: number;
  parentId: PaperId;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  isPrimary: boolean;
}

export type PlacementMap = Map<PaperId, FloatingPlacement>;

export interface FloatMeta {
  parentId: PaperId;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  isPrimary: boolean;
  nodeStartRect: DOMRect | null;
}

interface Props {
  paperMap: PaperMap;
  rootId?: PaperId;
}

export default function PaperCanvas({ paperMap, rootId }: Props) {
  const resolvedRootId = rootId ?? findRootId(paperMap);
  const [selectedContextId, setSelectedContextId] = useState<PaperId | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    paperId: null,
    parentId: null,
    returnParentId: null,
    point: null,
  });
  const [placementMap, setPlacementMap] = useState<PlacementMap>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);

  if (!resolvedRootId) {
    throw new Error('PaperCanvas requires a root node.');
  }

  const handleRequestFloat = useCallback((paperId: PaperId, info: PanInfo, meta: FloatMeta) => {
    const { nodeStartRect, ...placementMeta } = meta;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    setPlacementMap((prev) => {
      const existing = prev.get(paperId);
      let x: number, y: number;
      if (existing) {
        // 再ドラッグ：既存位置 + 今回のオフセット
        x = existing.x + info.offset.x;
        y = existing.y + info.offset.y;
      } else if (nodeStartRect && canvasRect) {
        // 初回フロート：ノードの元位置（canvas基準）+ ドラッグ量
        x = nodeStartRect.left - canvasRect.left + info.offset.x;
        y = nodeStartRect.top - canvasRect.top + info.offset.y;
      } else {
        x = info.offset.x;
        y = info.offset.y;
      }
      const next = new Map(prev);
      next.set(paperId, { mode: 'floating', x, y, ...placementMeta });
      return next;
    });
  }, []);

  return (
    <StoreProvider paperMap={paperMap}>
      <LayoutGroup>
        <div className="paper-canvas" ref={canvasRef}>
          <div className="paper-universe">
            <PaperNode
              paperId={resolvedRootId}
              parentId={null}
              isPrimary={true}
              depth={0}
              crumbs={[]}
              hue={null}
              selectedContextId={selectedContextId}
              onSelectContext={setSelectedContextId}
              dragState={dragState}
              onDragStateChange={setDragState}
              placementMap={placementMap}
              onRequestFloat={handleRequestFloat}
            />
          </div>
          <FloatingLayer
            placementMap={placementMap}
            dragState={dragState}
            selectedContextId={selectedContextId}
            onSelectContext={setSelectedContextId}
            onDragStateChange={setDragState}
            onPlacementMapChange={setPlacementMap}
          />
        </div>
      </LayoutGroup>
    </StoreProvider>
  );
}
