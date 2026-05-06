import { isOpen } from './expansion';
import type { ExpansionMap, PaperId, PaperMap } from './types';

export type NodeVisibilityState = 'expanded' | 'indexed' | 'closed';
export type VisibilityTransitionEvent =
  | 'OPEN_NODE'
  | 'CLOSE_NODE'
  | 'INDEX_CONTENT'
  | 'UNINDEX_CONTENT'
  | 'AUTO_CLOSE_NODE';

export interface NodeVisibilityContext {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
  indexedContentIds: Set<PaperId>;
}

export function deriveNodeVisibilityFromPaper(
  parentId: PaperId | null,
  isOpenToParent: boolean,
  isIndexed: boolean,
): NodeVisibilityState {
  if (parentId !== null && !isOpenToParent) return 'closed';
  return isIndexed ? 'indexed' : 'expanded';
}

export function deriveNodeVisibilityState(
  nodeId: PaperId,
  context: NodeVisibilityContext,
): NodeVisibilityState {
  const paper = context.paperMap.get(nodeId);
  if (!paper) return 'closed';
  const isOpenToParent =
    paper.parentId === null ? true : isOpen(context.expansionMap, paper.parentId, nodeId);
  const isIndexed = context.indexedContentIds.has(nodeId);
  return deriveNodeVisibilityFromPaper(paper.parentId, isOpenToParent, isIndexed);
}

export function getNextNodeVisibilityState(
  current: NodeVisibilityState,
  event: VisibilityTransitionEvent,
): NodeVisibilityState {
  switch (event) {
    case 'OPEN_NODE':
      return 'expanded';
    case 'CLOSE_NODE':
      return 'closed';
    case 'INDEX_CONTENT':
      return current === 'expanded' ? 'indexed' : current;
    case 'UNINDEX_CONTENT':
      return current === 'indexed' ? 'expanded' : current;
    case 'AUTO_CLOSE_NODE':
      return 'closed';
    default:
      return current;
  }
}
