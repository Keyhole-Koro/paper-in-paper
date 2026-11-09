import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { getEffectiveAttention, isProtected } from './attention';
import type { Command } from './commands';
import { computeCanvasLayout, type CanvasLayout, type CanvasSize } from './layout';
import type { PaperId, PaperViewState } from './types';

/**
 * Automatic space management. When a room is cramped (an open child below its minimum size or
 * outside the aspect-ratio bounds) and holds at least two papers, the least important one gives
 * way, in two stages:
 *   1. INDEX_CONTENT: its body moves into an index label; its open children stay.
 *   2. AUTO_CLOSE_NODE: an already indexed paper that still reserves room is closed.
 * A room's last paper is never taken away to make room for nothing. Separately, indexed papers
 * with nothing open inside are closed once their attention decays to `autoCloseThreshold`.
 *
 * Protected papers (just opened, restored or unindexed), pinned papers and the focused paper are
 * never chosen.
 */

function byImportance(state: PaperViewState, config: PaperCanvasConfig) {
  return (a: PaperId, b: PaperId) => {
    const ia = getEffectiveAttention(state, a, config);
    const ib = getEffectiveAttention(state, b, config);
    if (ia !== ib) return ia - ib;
    return (state.accessMap.get(a) ?? 0) - (state.accessMap.get(b) ?? 0);
  };
}

function isMovable(state: PaperViewState, id: PaperId): boolean {
  return !isProtected(state, id)
    && state.paperMap.get(id)?.pinnedLayout?.minShare === undefined
    && state.focusedNodeId !== id;
}

/**
 * Whether closing `id` leaves everything space management must not touch alone: the paper and
 * every visible paper inside it must be unprotected, unpinned and unfocused. (Closing an
 * indexed parent would otherwise hide the paper the reader just focused.)
 */
function isClosable(state: PaperViewState, layout: CanvasLayout, id: PaperId): boolean {
  const stack = [id];
  const seen = new Set<PaperId>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (!isMovable(state, current)) return false;
    for (const childId of layout.demand.visibleChildMap.get(current) ?? []) stack.push(childId);
  }
  return true;
}

/** The next space-management command for the laid-out state, or null when nothing is needed. */
export function pickSpaceManagementCommand(
  state: PaperViewState,
  layout: CanvasLayout,
  config: PaperCanvasConfig,
): Command | null {
  const threshold = config.attention.autoCloseThreshold;
  if (threshold > 0) {
    for (const [id, entry] of layout.entries) {
      if (entry.policy.mode !== 'indexed-leaf' || !isClosable(state, layout, id)) continue;
      if (getEffectiveAttention(state, id, config) <= threshold) return { type: 'AUTO_CLOSE_NODE', nodeId: id };
    }
  }

  const order = byImportance(state, config);
  for (const entry of layout.entries.values()) {
    if (entry.roomLayout.crampedChildIds.length === 0) continue;
    const reserving = Array.from(entry.roomLayout.childRects.keys())
      .filter((id) => layout.entries.get(id)?.policy.reservesRoom);
    if (reserving.length < 2) continue;

    const expanded = reserving
      .filter((id) => layout.entries.get(id)?.policy.mode === 'expanded' && isMovable(state, id))
      .sort(order);
    if (expanded.length > 0) return { type: 'INDEX_CONTENT', nodeId: expanded[0] };

    const indexedBranches = reserving
      .filter((id) => layout.entries.get(id)?.policy.mode === 'indexed-branch' && isClosable(state, layout, id))
      .sort(order);
    if (indexedBranches.length > 0) return { type: 'AUTO_CLOSE_NODE', nodeId: indexedBranches[0] };
  }
  return null;
}

export interface SettledState {
  state: PaperViewState;
  layout: CanvasLayout;
  /** The commands space management applied, in order. */
  applied: Command[];
}

/**
 * Applies space management until the canvas is settled: lays the state out, applies the next
 * command, and repeats. Every step either indexes or closes a paper, so it ends; the iteration
 * cap only guards against a broken reducer.
 */
export function settleSpace(
  state: PaperViewState,
  config: PaperCanvasConfig,
  rootId: PaperId | null,
  size: CanvasSize,
  reduce: (state: PaperViewState, command: Command) => PaperViewState,
  previous?: CanvasLayout | null,
): SettledState {
  let current = state;
  let layout = computeCanvasLayout(current, config, rootId, size, previous);
  const applied: Command[] = [];
  if (layout.entries.size === 0) return { state: current, layout, applied };

  const maxSteps = layout.entries.size * 2 + 8;
  for (let step = 0; step < maxSteps; step += 1) {
    const command = pickSpaceManagementCommand(current, layout, config);
    if (!command) break;
    const next = reduce(current, command);
    if (next === current) break;
    applied.push(command);
    current = next;
    layout = computeCanvasLayout(current, config, rootId, size, layout);
  }
  return { state: current, layout, applied };
}
