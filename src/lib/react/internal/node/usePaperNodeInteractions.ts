import { useCallback } from 'react';
import type { PaperId } from '../../../core/types';
import type { ExpansionAction } from '../../../core/expansion';

interface Params {
  paperId: PaperId;
  parentId: PaperId | null;
  isRoot: boolean;
  isPrimary: boolean;
  crumbs: PaperId[];
  dispatch: React.Dispatch<ExpansionAction>;
}

export function usePaperNodeInteractions({
  paperId,
  parentId,
  isRoot,
  isPrimary,
  crumbs,
  dispatch,
}: Params) {
  const handleHeaderClick = useCallback(() => {
    if (isRoot) return;
    if (isPrimary) {
      dispatch({ type: 'CLOSE', childId: paperId, parentId: parentId! });
      return;
    }
    dispatch({ type: 'SET_PRIMARY', parentId: parentId!, childId: paperId });
  }, [isRoot, isPrimary, dispatch, paperId, parentId]);

  const handleCrumbClick = useCallback((idx: number) => {
    const toClose = idx + 1 < crumbs.length ? crumbs[idx + 1] : paperId;
    const fromParent = crumbs[idx];
    dispatch({ type: 'CLOSE', childId: toClose, parentId: fromParent });
  }, [crumbs, paperId, dispatch]);

  return {
    handleHeaderClick,
    handleCrumbClick,
  };
}
