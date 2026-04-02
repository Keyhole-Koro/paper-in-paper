import type { PaperId } from '../../../../core/types';
import type { DragState } from '../../types';

export interface PaperNodeProps {
  paperId: PaperId;
  parentId: PaperId | null;
  parentGridRowHeight?: number;
  nodeState: 'closed' | 'open';
  isPrimary: boolean;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  dragState: DragState;
  onDragStateChange: (state: DragState) => void;
  onInsertDrop: (paperId: PaperId, parentId: PaperId, insertBeforeId: PaperId | null) => void;
  allowCrumbInteractions?: boolean;
  allowHeaderInteractions?: boolean;
}
