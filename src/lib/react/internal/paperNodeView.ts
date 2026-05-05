import type { PaperId } from '../../core/types';
import type { PaperNodeConfig } from '../../config/paperCanvasConfig';
import type { NodeLayoutEntry } from '../context/LayoutContext';

export type PaperInteractionMode = 'idle' | 'focused' | 'drag-target';

export interface PaperNodeViewModel {
  nodeId: PaperId;
  interactionMode: PaperInteractionMode;
  roomWidth: number;
  roomHeight: number;
  isContentIndexed: boolean;
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
  isContentIndexed,
  config,
}: {
  nodeId: PaperId;
  entry: NodeLayoutEntry | undefined;
  isFocused: boolean;
  isDragTarget: boolean;
  isContentIndexed: boolean;
  config: PaperNodeConfig;
}): PaperNodeViewModel {
  const roomWidth = Math.max(0, (entry?.allocatedRect.width ?? 0) - config.borderWidth);
  const headerHeight = isContentIndexed ? 0 : config.headerHeight;
  const roomHeight = Math.max(0, (entry?.allocatedRect.height ?? 0) - headerHeight - config.borderWidth);
  const interactionMode = derivePaperInteractionMode({ isFocused, isDragTarget });

  return {
    nodeId,
    interactionMode,
    roomWidth,
    roomHeight,
    isContentIndexed,
  };
}
