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
  // Guard against the auto-close ↔ auto-index oscillation: when overflow
  // persists after our dispatch, this useEffect re-runs on the next
  // layoutMap. Without de-dup we end up dispatching the same command for
  // the same node on every layout snapshot, producing a visible flicker.
  const lastDispatchRef = useRef(new Map<PaperId, { type: Command['type']; nodeId: PaperId }>());

  useEffect(() => {
    const now = Date.now();
    const seenParents = new Set<PaperId>();
    for (const [parentId, entry] of layoutMap) {
      if (entry.roomLayout.overflowChildCount === 0) continue;
      const candidates = selectLowImportanceCandidates(stateRef.current, parentId, now, config);
      if (candidates.length === 0) continue;
      const firstCandidate = candidates[0];
      const visibility = deriveNodeVisibilityState(firstCandidate, stateRef.current);
      const cmd: Command = visibility === 'expanded'
        ? { type: 'INDEX_CONTENT', nodeId: firstCandidate }
        : { type: 'AUTO_CLOSE_NODE', nodeId: firstCandidate };
      const prev = lastDispatchRef.current.get(parentId);
      if (prev && prev.type === cmd.type && prev.nodeId === cmd.nodeId) continue;
      lastDispatchRef.current.set(parentId, { type: cmd.type, nodeId: cmd.nodeId });
      seenParents.add(parentId);
      if (typeof window !== 'undefined' && (window as { __pipDebug?: boolean }).__pipDebug) {
        console.log('[pip-debug] useOverflowAutoClose dispatch', { parentId, ...cmd, overflow: entry.roomLayout.overflowChildCount });
      }
      dispatch(cmd);
    }
    // Clear de-dup entries for parents that resolved their overflow this pass
    // so a future overflow can re-trigger the same candidate without sticking.
    for (const parentId of Array.from(lastDispatchRef.current.keys())) {
      if (!seenParents.has(parentId)) {
        const entry = layoutMap.get(parentId);
        if (!entry || entry.roomLayout.overflowChildCount === 0) {
          lastDispatchRef.current.delete(parentId);
        }
      }
    }
  }, [layoutMap, config, dispatch]);
}
