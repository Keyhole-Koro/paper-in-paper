import type { PaperId } from '../../../../core/types';
import type { DragState } from '../../types';

export interface PaperNodeProps {
  paperId: PaperId;
  parentId: PaperId | null;
  nodeState: 'closed' | 'open';
  isPrimary: boolean;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  gridColumnSpan?: number;
  gridRowSpan?: number;
  onMeasuredHeight?: (paperId: PaperId, height: number) => void;
  dragState: DragState;
  onDragStateChange: (state: DragState) => void;
  onInsertDrop: (paperId: PaperId, parentId: PaperId, insertBeforeId: PaperId | null) => void;
  allowCrumbInteractions?: boolean;
  allowHeaderInteractions?: boolean;
}
