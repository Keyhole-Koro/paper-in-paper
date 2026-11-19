import { isOpen } from './expansion';
import type { ExpansionMap, PaperId, PaperMap } from './types';

export type NodeVisibilityState = 'expanded' | 'indexed' | 'closed';

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
