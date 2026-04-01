import type { PanInfo } from 'framer-motion';
import type { PaperId } from '../../core/types';
import type { DragState, FloatMeta, PlacementMap } from './internalTypes';

export interface PaperNodeProps {
  paperId: PaperId;
  parentId: PaperId | null;
  mode?: 'docked' | 'floating-duplicate';
  isPrimary: boolean;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  selectedContextId: PaperId | null;
  onSelectContext: (paperId: PaperId | null) => void;
  dragState: DragState;
  onDragStateChange: (state: DragState) => void;
  placementMap: PlacementMap;
  onRequestFloat?: (paperId: PaperId, info: PanInfo, meta: FloatMeta) => void;
  allowCrumbInteractions?: boolean;
  allowHeaderInteractions?: boolean;
  allowContextInteractions?: boolean;
}
