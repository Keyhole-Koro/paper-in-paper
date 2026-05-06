import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import type { PaperId, PaperMap } from './types';
import {
  deriveNodeVisibilityState,
  type NodeVisibilityContext,
  type NodeVisibilityState,
} from './nodeVisibility';

export type NodeDisplayMode = 'expanded' | 'indexed-branch' | 'indexed-leaf';

export interface NodeLayoutPolicyContext extends NodeVisibilityContext {
  paperMap: PaperMap;
}

export interface NodeLayoutPolicy {
  mode: NodeDisplayMode;
  hasHeader: boolean;
  hasContent: boolean;
  showsIndexLabel: boolean;
  reservesRoom: boolean;
  headerHeight: number;
  contentDemandEnabled: boolean;
  childRoomEnabled: boolean;
}

export function deriveNodeDisplayMode(
  hasChildren: boolean,
  visibility: NodeVisibilityState,
): NodeDisplayMode {
  if (visibility !== 'indexed') return 'expanded';
  return hasChildren ? 'indexed-branch' : 'indexed-leaf';
}

export function deriveNodeLayoutPolicyFromVisibility(
  hasChildren: boolean,
  visibility: NodeVisibilityState,
  config: PaperCanvasConfig,
): NodeLayoutPolicy {
  const mode = deriveNodeDisplayMode(hasChildren, visibility);
  if (mode === 'expanded') {
    return {
      mode,
      hasHeader: true,
      hasContent: true,
      showsIndexLabel: false,
      reservesRoom: true,
      headerHeight: config.paperNode.headerHeight,
      contentDemandEnabled: true,
      childRoomEnabled: true,
    };
  }

  if (mode === 'indexed-branch') {
    return {
      mode,
      hasHeader: false,
      hasContent: false,
      showsIndexLabel: true,
      reservesRoom: true,
      headerHeight: 0,
      contentDemandEnabled: false,
      childRoomEnabled: true,
    };
  }

  return {
    mode,
    hasHeader: false,
    hasContent: false,
    showsIndexLabel: true,
    reservesRoom: false,
    headerHeight: 0,
    contentDemandEnabled: false,
    childRoomEnabled: false,
  };
}

export function deriveNodeLayoutPolicy(
  nodeId: PaperId,
  context: NodeLayoutPolicyContext,
  config: PaperCanvasConfig,
): NodeLayoutPolicy {
  const paper = context.paperMap.get(nodeId);
  const hasChildren = (paper?.childIds.length ?? 0) > 0;
  const visibility = deriveNodeVisibilityState(nodeId, context);
  return deriveNodeLayoutPolicyFromVisibility(hasChildren, visibility, config);
}
