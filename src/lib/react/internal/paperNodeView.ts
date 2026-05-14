import type { PaperId } from '../../core/types';
import type { PaperNodeConfig } from '../../config/paperCanvasConfig';
import type { NodeLayoutEntry } from '../context/LayoutContext';
import type { NodeLayoutPolicy } from '../../core/nodeLayoutPolicy';

export type PaperInteractionMode = 'idle' | 'focused' | 'drag-target';

export interface PaperNodeViewModel {
  nodeId: PaperId;
  interactionMode: PaperInteractionMode;
  roomWidth: number;
  roomHeight: number;
  layoutPolicy: NodeLayoutPolicy;
}

export function derivePaperInteractionMode({
  isFocused,
  isDragTarget,
}: {
  isFocused: boolean;
  isDragTarget: boolean;
}): PaperInteractionMode {
  if (isDragTarget) return 'drag-target';
  if (isFocused) return 'focused';
  return 'idle';
}

export function derivePaperNodeViewModel({
  nodeId,
  entry,
  isFocused,
  isDragTarget,
  layoutPolicy,
  config,
}: {
  nodeId: PaperId;
  entry: NodeLayoutEntry | undefined;
  isFocused: boolean;
  isDragTarget: boolean;
  layoutPolicy: NodeLayoutPolicy;
  config: PaperNodeConfig;
}): PaperNodeViewModel {
  const roomWidth = Math.max(0, (entry?.allocatedRect.width ?? 0) - config.borderWidth);
  const headerHeight = layoutPolicy.headerHeight;
  const roomHeight = Math.max(0, (entry?.allocatedRect.height ?? 0) - headerHeight - config.borderWidth);
  const interactionMode = derivePaperInteractionMode({ isFocused, isDragTarget });

  return {
    nodeId,
    interactionMode,
    roomWidth,
    roomHeight,
    layoutPolicy,
  };
}
