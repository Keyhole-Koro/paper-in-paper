import { useEffect, useRef } from 'react';
import { usePaperStore } from '../context/PaperStoreContext';
import { selectAutoCloseCandidates } from '../internal/autoClose';
import { getOpenChildIds } from '../../core/expansion';

const TICK_INTERVAL_MS = 5000;
/** importance がこの値を下回った open child は自動縮小候補になる */
const AUTO_CLOSE_THRESHOLD = 5;

export function useImportanceTick() {
  const { state, dispatch } = usePaperStore();
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const s = stateRef.current;

      dispatch({ type: 'TICK_IMPORTANCE', now });

      // auto close candidates across all open nodes
      for (const parentId of s.paperMap.keys()) {
        const openChildIds = getOpenChildIds(s.expansionMap, parentId);
        if (openChildIds.length === 0) continue;

        const candidates = selectAutoCloseCandidates(s, parentId, now);
        for (const nodeId of candidates) {
          const importance = s.importanceMap.get(nodeId) ?? 0;
          if (importance < AUTO_CLOSE_THRESHOLD) {
            dispatch({ type: 'AUTO_CLOSE_NODE', nodeId });
          }
        }
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [dispatch]);
}
