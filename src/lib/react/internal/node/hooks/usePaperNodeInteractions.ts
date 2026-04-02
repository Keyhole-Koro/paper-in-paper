import { useCallback } from 'react';
import type { PaperId } from '../../../../core/types';

interface Params {
  paperId: PaperId;
  parentId: PaperId | null;
  isRoot: boolean;
  isPrimary: boolean;
  crumbs: PaperId[];
  closeNode: (parentId: PaperId, childId: PaperId) => void;
  setPrimaryNode: (parentId: PaperId, childId: PaperId) => void;
}

export function usePaperNodeInteractions({
  paperId,
  parentId,
  isRoot,
  isPrimary,
  crumbs,
  closeNode,
  setPrimaryNode,
}: Params) {
  const handleHeaderClick = useCallback(() => {
    if (isRoot) return;
    if (isPrimary) {
      closeNode(parentId!, paperId);
      return;
    }
    setPrimaryNode(parentId!, paperId);
  }, [isRoot, isPrimary, closeNode, setPrimaryNode, paperId, parentId]);

  const handleCrumbClick = useCallback((idx: number) => {
    const toClose = idx + 1 < crumbs.length ? crumbs[idx + 1] : paperId;
    const fromParent = crumbs[idx];
    closeNode(fromParent, toClose);
  }, [crumbs, paperId, closeNode]);

  return {
    handleHeaderClick,
    handleCrumbClick,
  };
}
