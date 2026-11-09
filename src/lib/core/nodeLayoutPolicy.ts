import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import type { PaperId, PaperMap } from './types';
import { getVisibleChildIds } from './expansion';
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

const EXPANDED = (headerHeight: number): NodeLayoutPolicy => ({
  mode: 'expanded',
  hasHeader: true,
  hasContent: true,
  showsIndexLabel: false,
  reservesRoom: true,
  headerHeight,
  contentDemandEnabled: true,
  childRoomEnabled: true,
});

const INDEXED_BRANCH: NodeLayoutPolicy = {
  mode: 'indexed-branch',
  hasHeader: false,
  hasContent: false,
  showsIndexLabel: true,
  reservesRoom: true,
  headerHeight: 0,
  contentDemandEnabled: false,
  childRoomEnabled: true,
};

const INDEXED_LEAF: NodeLayoutPolicy = {
  mode: 'indexed-leaf',
  hasHeader: false,
  hasContent: false,
  showsIndexLabel: true,
  reservesRoom: false,
  headerHeight: 0,
  contentDemandEnabled: false,
  childRoomEnabled: false,
};

let expandedCache: { headerHeight: number; policy: NodeLayoutPolicy } | null = null;

export function deriveNodeLayoutPolicyFromVisibility(
  hasOpenChildren: boolean,
  visibility: NodeVisibilityState,
  config: PaperCanvasConfig,
): NodeLayoutPolicy {
  const mode = deriveNodeDisplayMode(hasOpenChildren, visibility);
  if (mode === 'indexed-branch') return INDEXED_BRANCH;
  if (mode === 'indexed-leaf') return INDEXED_LEAF;
  const headerHeight = config.paperNode.headerHeight;
  if (expandedCache?.headerHeight !== headerHeight) {
    expandedCache = { headerHeight, policy: EXPANDED(headerHeight) };
  }
  return expandedCache.policy;
}

export function deriveNodeLayoutPolicy(
  nodeId: PaperId,
  context: NodeLayoutPolicyContext,
  config: PaperCanvasConfig,
): NodeLayoutPolicy {
  const hasOpenChildren = getVisibleChildIds(context.paperMap, context.expansionMap, nodeId).length > 0;
  const visibility = deriveNodeVisibilityState(nodeId, context);
  return deriveNodeLayoutPolicyFromVisibility(hasOpenChildren, visibility, config);
}
