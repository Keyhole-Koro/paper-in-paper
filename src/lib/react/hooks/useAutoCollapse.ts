import { useEffect, useRef } from 'react';
import type { PaperId } from '../../core/types';
import { selectLowImportanceCandidates } from '../../core/candidates';
import { usePaperStore } from '../context/PaperStoreContext';
import type { NodeLayoutEntry } from '../context/LayoutContext';

const DEBOUNCE_MS = 200;

interface UseAutoCollapseOptions {
  rootId: PaperId;
  layoutMap: Map<PaperId, NodeLayoutEntry>;
}

/**
 * layout pressure が出た時だけ、低重要度の open child の content を index 化する。
 * PaperNode 自体は閉じない。
 */
export function useAutoCollapse({ layoutMap }: UseAutoCollapseOptions) {
  const { state, dispatch } = usePaperStore();
  const lastDispatchRef = useRef(0);

  useEffect(() => {
    if (layoutMap.size === 0) return;

    const timer = setTimeout(() => {
      const now = Date.now();
      if (now - lastDispatchRef.current < DEBOUNCE_MS) return;

      for (const [parentId, entry] of layoutMap) {
        if (entry.roomLayout.overflowChildCount === 0) continue;

        const candidate = selectLowImportanceCandidates(state, parentId, now)
          .find((id) => !state.indexedContentIds.has(id));
        if (!candidate) continue;

        lastDispatchRef.current = now;
        dispatch({ type: 'INDEX_CONTENT', nodeId: candidate });
        return;
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [layoutMap, state, dispatch]);
}
