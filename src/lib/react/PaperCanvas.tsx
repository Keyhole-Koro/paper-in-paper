import { LayoutGroup } from 'framer-motion';
import { useState } from 'react';
import type { PaperId, PaperMap } from '../core/types';
import { findRootId } from '../core/tree';
import PaperNode from './internal/PaperNode';
import { StoreProvider } from './internal/store';

export interface DragState {
  paperId: PaperId | null;
  parentId: PaperId | null;
  point: { x: number; y: number } | null;
}

export interface FloatingPlacement {
  mode: 'floating';
  x: number;
  y: number;
}

export type PlacementMap = Map<PaperId, FloatingPlacement>;

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
    point: null,
  });
  const [placementMap, setPlacementMap] = useState<PlacementMap>(new Map());

  if (!resolvedRootId) {
    throw new Error('PaperCanvas requires a root node.');
  }

  return (
    <StoreProvider paperMap={paperMap}>
      <LayoutGroup>
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
            onPlacementMapChange={setPlacementMap}
          />
        </div>
      </LayoutGroup>
    </StoreProvider>
  );
}
