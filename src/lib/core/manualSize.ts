import type { ManualSizeMap, PaperId } from './types';

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
 * demand-driven siblings always keep a usable slice. When manual shares
 * exceed it they are scaled down proportionally (their relative sizes are
 * preserved). If a room contains nothing but manually sized items the
 * ceiling is lifted to 1 — there is no one left to make room for.
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
