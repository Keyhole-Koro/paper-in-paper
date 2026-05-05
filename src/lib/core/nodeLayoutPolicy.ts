import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import type { PaperId, PaperMap } from './types';

export type NodeDisplayMode = 'expanded' | 'indexed-branch' | 'indexed-leaf';

export interface NodeLayoutPolicyContext {
  paperMap: PaperMap;
  indexedContentIds: Set<PaperId>;
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

export function deriveNodeLayoutPolicyFromPaper(
  hasChildren: boolean,
  isIndexed: boolean,
  config: PaperCanvasConfig,
): NodeLayoutPolicy {
  if (!isIndexed) {
    return {
      mode: 'expanded',
      hasHeader: true,
      hasContent: true,
      showsIndexLabel: false,
      reservesRoom: true,
      headerHeight: config.paperNode.headerHeight,
      contentDemandEnabled: true,
      childRoomEnabled: true,
    };
  }

  if (hasChildren) {
    return {
      mode: 'indexed-branch',
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
    mode: 'indexed-leaf',
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
  const isIndexed = context.indexedContentIds.has(nodeId);
  return deriveNodeLayoutPolicyFromPaper(hasChildren, isIndexed, config);
}
