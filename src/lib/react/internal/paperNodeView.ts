import type { PaperId } from '../../core/types';
import type { PaperNodeConfig } from '../../config/paperCanvasConfig';
import type { NodeLayoutEntry } from '../context/LayoutContext';
import { shouldCollapseRoom } from './paperNodeConstants';

export type PaperVisibilityMode = 'normal' | 'collapsed' | 'hidden';
export type PaperInteractionMode = 'idle' | 'focused' | 'drag-target';

export interface PaperNodeViewModel {
  nodeId: PaperId;
  visibilityMode: PaperVisibilityMode;
  interactionMode: PaperInteractionMode;
  roomWidth: number;
  roomHeight: number;
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

export function derivePaperVisibilityMode({
  isRoot,
  entry,
  config,
}: {
  isRoot: boolean;
  entry: NodeLayoutEntry | undefined;
  config: PaperNodeConfig;
}): PaperVisibilityMode {
  if (entry?.hidden) return 'hidden';
  if (isRoot || !entry) return 'normal';

  const roomWidth = Math.max(0, entry.allocatedRect.width - config.borderWidth);
  const roomHeight = Math.max(0, entry.allocatedRect.height - config.headerHeight - config.borderWidth);

  return shouldCollapseRoom(entry.roomLayout, roomWidth, roomHeight, config) ? 'collapsed' : 'normal';
}

export function derivePaperNodeViewModel({
  nodeId,
  isRoot,
  entry,
  isFocused,
  isDragTarget,
  config,
}: {
  nodeId: PaperId;
  isRoot: boolean;
  entry: NodeLayoutEntry | undefined;
  isFocused: boolean;
  isDragTarget: boolean;
  config: PaperNodeConfig;
}): PaperNodeViewModel {
  const roomWidth = Math.max(0, (entry?.allocatedRect.width ?? 0) - config.borderWidth);
  const roomHeight = Math.max(0, (entry?.allocatedRect.height ?? 0) - config.headerHeight - config.borderWidth);
  const interactionMode = derivePaperInteractionMode({ isFocused, isDragTarget });

  return {
    nodeId,
    visibilityMode: derivePaperVisibilityMode({ isRoot, entry, config }),
    interactionMode,
    roomWidth,
    roomHeight,
  };
}
