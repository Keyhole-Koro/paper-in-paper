import { getOpenChildIds } from './expansion';
import type { ExpansionMap, ManualSizeMap, PaperId } from './types';

/**
 * Manual size = a share of the parent room's area (0〜1) that the user pinned
 * by dragging a resize handle. It bypasses the attention → demand → share
 * pipeline entirely: whatever the user set is treated as a fixed slice and the
 * remaining area is redistributed to the demand-driven siblings.
 */

/** A manually sized item never disappears completely... */
export const MIN_MANUAL_SHARE = 0.05;
/** ...and never swallows the whole room either. */
export const MAX_MANUAL_SHARE = 0.9;
/**
 * Ceiling for the sum of every manual share inside one room, so that
 * demand-driven siblings always keep a usable slice. It is enforced when a
 * resize is accepted — see getAvailableManualShare — rather than by rescaling
 * at layout time, because rescaling would move sizes the user had already set.
 */
export const MAX_MANUAL_SHARE_TOTAL = 0.92;

export const EMPTY_MANUAL_SIZE_MAP: ManualSizeMap = new Map();

export function clampManualShare(share: number): number {
  if (!Number.isFinite(share)) return MIN_MANUAL_SHARE;
  return Math.min(MAX_MANUAL_SHARE, Math.max(MIN_MANUAL_SHARE, share));
}

export function setManualShare(
  map: ManualSizeMap,
  nodeId: PaperId,
  share: number,
): ManualSizeMap {
  const next = clampManualShare(share);
  if (map.get(nodeId) === next) return map;
  return new Map(map).set(nodeId, next);
}

export function clearManualShare(map: ManualSizeMap, nodeId: PaperId): ManualSizeMap {
  if (!map.has(nodeId)) return map;
  const next = new Map(map);
  next.delete(nodeId);
  return next;
}

export function clearManualShares(
  map: ManualSizeMap,
  nodeIds: Iterable<PaperId>,
): ManualSizeMap {
  let next: ManualSizeMap | null = null;
  for (const nodeId of nodeIds) {
    if (!map.has(nodeId)) continue;
    next ??= new Map(map);
    next.delete(nodeId);
  }
  return next ?? map;
}

export function isManuallySized(map: ManualSizeMap, nodeId: PaperId): boolean {
  return map.get(nodeId) !== undefined;
}

export interface ManualShareRoomState {
  manualSizeMap: ManualSizeMap;
  manualContentSizeMap: ManualSizeMap;
  expansionMap: ExpansionMap;
}

/**
 * The largest share one item may claim inside `roomOwnerId`'s room without
 * pushing the room's manual total past the ceiling.
 *
 * A new resize takes its space from the demand-driven pool and, when that runs
 * out, is capped here — the sizes already set by hand are never touched. That
 * is what makes a hand-set size hold until it is explicitly reset.
 *
 * Pass the open child being resized as `excludeChildId`, or null when it is the
 * room's own content area.
 */
export function getAvailableManualShare(
  state: ManualShareRoomState,
  roomOwnerId: PaperId,
  excludeChildId: PaperId | null,
): number {
  let others = 0;
  if (excludeChildId !== null) {
    others += state.manualContentSizeMap.get(roomOwnerId) ?? 0;
  }
  for (const childId of getOpenChildIds(state.expansionMap, roomOwnerId)) {
    if (childId === excludeChildId) continue;
    others += state.manualSizeMap.get(childId) ?? 0;
  }
  return Math.max(MIN_MANUAL_SHARE, MAX_MANUAL_SHARE_TOTAL - others);
}
