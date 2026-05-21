import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import type { PaperId, PaperMap } from './types';
import { getOpenChildIds } from './expansion';
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
  hasOpenChildren: boolean,
  visibility: NodeVisibilityState,
): NodeDisplayMode {
  if (visibility !== 'indexed') return 'expanded';
  // An indexed node with no children currently open has nothing to show
  // inside its room — neither its own content (indexed → escapes to label)
  // nor any child paper. Reserving room for it just steals width from the
  // siblings without conveying anything, so collapse it to a leaf.
  return hasOpenChildren ? 'indexed-branch' : 'indexed-leaf';
}

export function deriveNodeLayoutPolicyFromVisibility(
  hasOpenChildren: boolean,
  visibility: NodeVisibilityState,
  config: PaperCanvasConfig,
): NodeLayoutPolicy {
  const mode = deriveNodeDisplayMode(hasOpenChildren, visibility);
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
  const hasOpenChildren = getOpenChildIds(context.expansionMap, nodeId).length > 0;
  const visibility = deriveNodeVisibilityState(nodeId, context);
  return deriveNodeLayoutPolicyFromVisibility(hasOpenChildren, visibility, config);
}
