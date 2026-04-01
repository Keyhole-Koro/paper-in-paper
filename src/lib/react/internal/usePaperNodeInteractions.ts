import { useCallback } from 'react';
import type { PaperId } from '../../core/types';
import type { ExpansionAction } from '../../core/expansion';

interface Params {
  paperId: PaperId;
  parentId: PaperId | null;
  isRoot: boolean;
  isPrimary: boolean;
  crumbs: PaperId[];
  childCrumbs: PaperId[];
  dispatch: React.Dispatch<ExpansionAction>;
  onSelectContext: (paperId: PaperId | null) => void;
}

export function usePaperNodeInteractions({
  paperId,
  parentId,
  isRoot,
  isPrimary,
  crumbs,
  childCrumbs,
  dispatch,
  onSelectContext,
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

  const handleContextChildClick = useCallback((contextId: PaperId, childId: PaperId) => {
    if (contextId === paperId) {
      dispatch({ type: 'OPEN', parentId: paperId, childId });
      return;
    }

    const contextIndex = childCrumbs.indexOf(contextId);
    const activeChildId = contextIndex === -1 ? null : childCrumbs[contextIndex + 1] ?? null;

    if (activeChildId === childId) {
      dispatch({ type: 'SET_PRIMARY', parentId: contextId, childId });
      return;
    }

    dispatch({ type: 'OPEN', parentId: contextId, childId });
  }, [paperId, dispatch, childCrumbs]);

  const onContextChildClick = useCallback(
    (childId: PaperId) => handleContextChildClick(paperId, childId),
    [handleContextChildClick, paperId],
  );

  const handleHeaderMouseLeave = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientY >= bounds.bottom - 1) {
      onSelectContext(null);
    }
  }, [onSelectContext]);

  return {
    handleHeaderClick,
    handleCrumbClick,
    handleContextChildClick,
    onContextChildClick,
    handleHeaderMouseLeave,
  };
}
