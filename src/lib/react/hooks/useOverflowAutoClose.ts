import { useEffect, useRef } from 'react';
import type { PaperId, PaperViewState } from '../../core/types';
import type { PaperCanvasConfig } from '../../config/paperCanvasConfig';
import { selectLowImportanceCandidates } from '../../core/candidates';
import { deriveNodeVisibilityState } from '../../core/nodeVisibility';
import type { NodeLayoutEntry } from '../context/LayoutContext';
import type { Command } from '../../core/commands';

export function useOverflowAutoClose(
  layoutMap: Map<PaperId, NodeLayoutEntry>,
  state: PaperViewState,
  config: PaperCanvasConfig,
  dispatch: (command: Command) => void,
) {
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const now = Date.now();
    for (const [parentId, entry] of layoutMap) {
      if (entry.roomLayout.overflowChildCount === 0) continue;
      const candidates = selectLowImportanceCandidates(stateRef.current, parentId, now, config);
      if (candidates.length === 0) continue;
      const firstCandidate = candidates[0];
      const visibility = deriveNodeVisibilityState(firstCandidate, stateRef.current);
      dispatch(
        visibility === 'expanded'
          ? { type: 'INDEX_CONTENT', nodeId: firstCandidate }
          : { type: 'AUTO_CLOSE_NODE', nodeId: firstCandidate },
      );
    }
  }, [layoutMap, config, dispatch]);
}
