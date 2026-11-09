import type { PaperCanvasConfig } from '../config/paperCanvasConfig';
import { getAttentionMultiplier, getEffectiveAttention } from './attention';
import { getContentDemandFactor } from './contentMass';
import { getVisibleChildIds } from './expansion';
import { deriveNodeLayoutPolicyFromVisibility, type NodeLayoutPolicy } from './nodeLayoutPolicy';
import { deriveNodeVisibilityState } from './nodeVisibility';
import type { MinSize, Paper, PaperId, PaperLayoutResult, PaperViewState } from './types';

export interface LayoutItem {
  id: string;
  weight: number;
}

export interface LayoutRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomLayoutResult {
  rects: LayoutRect[];
}

export interface NodeRoomLayout {
  contentRect: LayoutRect;
  /** Open children in layout order. Indexed leaves get a zero-size rect. */
  childRects: Map<PaperId, LayoutRect>;
  /** Children that are not open, in childIds order. */
  closedChildIds: PaperId[];
  /** Open children below their minimum size or outside the aspect-ratio bounds. */
  crampedChildIds: PaperId[];
}

export interface NodeLayoutEntry {
  /** The paper's rect in canvas coordinates. */
  allocatedRect: LayoutRect;
  roomLayout: NodeRoomLayout;
  policy: NodeLayoutPolicy;
}

export interface DemandSnapshot {
  policyMap: Map<PaperId, NodeLayoutPolicy>;
  contentDemandMap: Map<PaperId, number>;
  roomDemandMap: Map<PaperId, number>;
  effectiveAttentionMap: Map<PaperId, number>;
  /** Open children that really belong to each paper, in layout order. */
  visibleChildMap: Map<PaperId, PaperId[]>;
}

export interface CanvasLayout {
  rootId: PaperId | null;
  width: number;
  height: number;
  /** Laid-out papers, parents before children. */
  entries: Map<PaperId, NodeLayoutEntry>;
  demand: DemandSnapshot;
}

export interface CanvasSize {
  width: number;
  height: number;
}

type LayoutState = Pick<
  PaperViewState,
  'paperMap' | 'expansionMap' | 'indexedContentIds' | 'attentionMap' | 'attentionTimestampMap' | 'accessMap' | 'clock' | 'focusedNodeId'
>;

export const CONTENT_ID = '__content__';
/** Width of the divider line between a room's content and its children, in px. */
export const CHILD_DIVIDER_PX = 1;
const SHRINK_STEP = 0.84;
const MAX_SHRINK_PASSES = 6;
const ROOM_MIN_WEIGHT = 1;
const AUTO_OPEN_CHILD_MIN_SHARE = 0.18;
const AUTO_OPEN_CHILD_MIN_SHARE_BUDGET = 0.72;

const ZERO_RECT: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: 0, height: 0 };

function emptyDemand(): DemandSnapshot {
  return {
    policyMap: new Map(),
    contentDemandMap: new Map(),
    roomDemandMap: new Map(),
    effectiveAttentionMap: new Map(),
    visibleChildMap: new Map(),
  };
}

function importanceOf(paper: Paper | undefined): number {
  const value = paper?.importance;
  return value === undefined || !Number.isFinite(value) ? 1 : Math.max(0, value);
}

/** The base content demand: what a paper of reference mass gets at attention multiplier 1. */
export function baseContentDemand(config: PaperCanvasConfig): number {
  return config.paperNode.headerHeight * 3;
}

/**
 * Demand per visible paper below `rootId`:
 *   content(node) = base × content factor × contentImportance% × attention multiplier
 *   room(node)    = content(node) + Σ room(child) × importance(child)   over visible children
 * Only edges consistent with the paper map are followed, and each paper is visited once.
 */
export function buildDemandSnapshot(
  state: LayoutState,
  config: PaperCanvasConfig,
  rootId: PaperId,
): DemandSnapshot {
  const snapshot = emptyDemand();
  if (!state.paperMap.has(rootId)) return snapshot;
  const base = baseContentDemand(config);

  const visit = (id: PaperId): number => {
    const cached = snapshot.roomDemandMap.get(id);
    if (cached !== undefined) return cached;
    // Mark before recursing: a malformed map can never send us around a loop.
    snapshot.roomDemandMap.set(id, 0);

    const paper = state.paperMap.get(id);
    const visible = getVisibleChildIds(state.paperMap, state.expansionMap, id);
    const policy = deriveNodeLayoutPolicyFromVisibility(
      visible.length > 0,
      deriveNodeVisibilityState(id, state),
      config,
    );
    const attention = getEffectiveAttention(state, id, config);
    snapshot.policyMap.set(id, policy);
    snapshot.effectiveAttentionMap.set(id, attention);

    const contentImportance = paper?.contentImportance ?? 100;
    const content = policy.contentDemandEnabled && paper
      ? base
        * getContentDemandFactor(paper, config)
        * Math.max(0, contentImportance) / 100
        * getAttentionMultiplier(attention, config)
      : 0;
    snapshot.contentDemandMap.set(id, content);

    const children = policy.childRoomEnabled ? visible : [];
    snapshot.visibleChildMap.set(id, children);
    let total = content;
    for (const childId of children) {
      total += visit(childId) * importanceOf(state.paperMap.get(childId));
    }
    snapshot.roomDemandMap.set(id, total);
    return total;
  };

  visit(rootId);
  return snapshot;
}

function worstAspectRatio(
  rowItems: LayoutItem[],
  rowWeight: number,
  totalWeight: number,
  containerWidth: number,
  containerHeight: number,
): number {
  const rowHeight = (rowWeight / totalWeight) * containerHeight;
  if (rowHeight <= 0) return Infinity;

  let worst = 0;
  for (const item of rowItems) {
    const w = (item.weight / rowWeight) * containerWidth;
    const ar = Math.max(w / rowHeight, rowHeight / w);
    if (ar > worst) worst = ar;
  }
  return worst;
}

/** The largest long-side / short-side ratio among the rects. */
function worstRectAspect(rects: LayoutRect[]): number {
  let worst = 0;
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) return Infinity;
    worst = Math.max(worst, r.width / r.height, r.height / r.width);
  }
  return worst;
}

/** Strips must beat the default orientation by this factor to be used, so layouts don't flip-flop. */
const ORIENTATION_SWITCH_GAIN = 0.85;

/**
 * Packs weighted items into a rectangle in strips, keeping each strip's worst aspect ratio as
 * low as it can. Items keep their order. Strips run along the shorter side unless running them
 * the other way gives clearly squarer rects.
 */
export function computeRoomLayout(
  items: LayoutItem[],
  containerWidth: number,
  containerHeight: number,
): RoomLayoutResult {
  if (items.length === 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { rects: [] };
  }
  // Items without weight get no area (and would divide by zero inside a strip).
  const weighted = items.filter((item) => item.weight > 0 && Number.isFinite(item.weight));
  if (weighted.length === 0) return { rects: [] };
  const preferColumns = containerWidth > containerHeight;
  const primary = stripLayout(weighted, containerWidth, containerHeight, preferColumns);
  const alternative = weighted.length <= 2 ? primary : stripLayout(weighted, containerWidth, containerHeight, !preferColumns);
  const chosen = worstRectAspect(alternative.rects) < worstRectAspect(primary.rects) * ORIENTATION_SWITCH_GAIN
    ? alternative
    : primary;
  if (weighted.length === items.length) return chosen;
  const byId = new Map(chosen.rects.map((rect) => [rect.id, rect]));
  return {
    rects: items.map((item) => byId.get(item.id) ?? { id: item.id, x: 0, y: 0, width: 0, height: 0 }),
  };
}

function stripLayout(
  items: LayoutItem[],
  containerWidth: number,
  containerHeight: number,
  useColumns: boolean,
): RoomLayoutResult {
  const w = useColumns ? containerHeight : containerWidth;
  const h = useColumns ? containerWidth : containerHeight;

  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight <= 0) {
    return { rects: [] };
  }

  const rows: LayoutItem[][] = [];
  let currentRow: LayoutItem[] = [];
  let currentRowWeight = 0;

  for (const item of items) {
    if (currentRow.length === 0) {
      currentRow.push(item);
      currentRowWeight += item.weight;
      continue;
    }

    const prevWorst = worstAspectRatio(currentRow, currentRowWeight, totalWeight, w, h);
    const nextWeight = currentRowWeight + item.weight;
    const nextWorst = worstAspectRatio([...currentRow, item], nextWeight, totalWeight, w, h);

    if (nextWorst <= prevWorst) {
      currentRow.push(item);
      currentRowWeight = nextWeight;
    } else {
      rows.push(currentRow);
      currentRow = [item];
      currentRowWeight = item.weight;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  const rects: LayoutRect[] = [];
  let y = 0;

  for (const row of rows) {
    const rowWeight = row.reduce((s, i) => s + i.weight, 0);
    const rowHeight = (rowWeight / totalWeight) * h;

    let x = 0;
    for (const item of row) {
      const width = (item.weight / rowWeight) * w;
      rects.push({ id: item.id, x, y, width, height: rowHeight });
      x += width;
    }
    y += rowHeight;
  }

  if (useColumns) {
    return {
      rects: rects.map((r) => ({ id: r.id, x: r.y, y: r.x, width: r.height, height: r.width })),
    };
  }
  return { rects };
}

/**
 * Rounds rects to whole pixels by rounding their edges, so neighbours that shared an edge still
 * share it (no gaps, no overlaps) and recomputing an unchanged layout yields identical rects.
 */
export function snapRects(rects: LayoutRect[]): LayoutRect[] {
  return rects.map((r) => {
    const x0 = Math.round(r.x);
    const y0 = Math.round(r.y);
    const x1 = Math.round(r.x + r.width);
    const y1 = Math.round(r.y + r.height);
    return { id: r.id, x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  });
}

export interface ShareInput {
  id: string;
  demand: number;
  minShare: number;
}

function getAutoOpenChildMinShare(openChildCount: number): number {
  if (openChildCount <= 0) return 0;
  return Math.min(
    AUTO_OPEN_CHILD_MIN_SHARE,
    AUTO_OPEN_CHILD_MIN_SHARE_BUDGET / openChildCount,
  );
}

/**
 * Turns demands into shares that sum to 1: every item first gets its minimum share, the rest is
 * split by demand above that minimum. Minimums that add up past 1 are scaled down together.
 */
export function normalizeShares(items: ShareInput[]): Map<string, number> {
  if (items.length === 0) return new Map();

  const demandTotal = items.reduce((sum, item) => sum + Math.max(0, item.demand), 0);
  const rawShares = new Map<string, number>(
    items.map((item) => [item.id, demandTotal > 0 ? Math.max(0, item.demand) / demandTotal : 1 / items.length]),
  );

  const mandatoryTotal = items.reduce((sum, item) => sum + Math.max(0, item.minShare), 0);
  if (mandatoryTotal >= 1) {
    const result = new Map<string, number>();
    for (const item of items) {
      result.set(item.id, Math.max(0, item.minShare) / mandatoryTotal);
    }
    return result;
  }

  const available = 1 - mandatoryTotal;
  const extraBasis = new Map<string, number>();
  let extraTotal = 0;
  for (const item of items) {
    const raw = rawShares.get(item.id) ?? 0;
    const basis = item.minShare > 0 ? Math.max(0, raw - item.minShare) : raw;
    extraBasis.set(item.id, basis);
    extraTotal += basis;
  }

  if (extraTotal <= 0) {
    for (const item of items) {
      extraBasis.set(item.id, rawShares.get(item.id) ?? 0);
    }
    extraTotal = Array.from(extraBasis.values()).reduce((sum, value) => sum + value, 0);
  }

  const result = new Map<string, number>();
  for (const item of items) {
    const mandatory = Math.max(0, item.minShare);
    const basis = extraBasis.get(item.id) ?? 0;
    const extra = extraTotal > 0 ? available * (basis / extraTotal) : available / items.length;
    result.set(item.id, mandatory + extra);
  }
  return result;
}

/** The smallest size an open paper should get: its own minWidth/minHeight or the config default. */
export function getMinPaperSize(paper: Paper | undefined, config: PaperCanvasConfig): MinSize {
  return {
    w: paper?.minWidth ?? config.layout.minPaperWidth,
    h: paper?.minHeight ?? config.layout.minPaperHeight,
  };
}

function isCramped(rect: LayoutRect, min: MinSize, config: PaperCanvasConfig): boolean {
  if (rect.width <= 0 || rect.height <= 0) return true;
  if (rect.width < min.w || rect.height < min.h) return true;
  const ar = rect.height / rect.width;
  return ar < config.layout.minAspectRatio || ar > config.layout.maxAspectRatio;
}

function outsideAspectRatio(rect: LayoutRect, config: PaperCanvasConfig): boolean {
  if (rect.width <= 0 || rect.height <= 0) return true;
  const ar = rect.height / rect.width;
  return ar < config.layout.minAspectRatio || ar > config.layout.maxAspectRatio;
}

/** Shares from a paper's custom layout function, or null when it fails or returns nonsense. */
function customShares(
  parent: Paper,
  contentEnabled: boolean,
  childIds: PaperId[],
  width: number,
  height: number,
  state: LayoutState,
  config: PaperCanvasConfig,
): Map<string, number> | null {
  if (!parent.layout) return null;
  let result: PaperLayoutResult;
  try {
    result = parent.layout({
      openChildIds: [...childIds],
      focusedNodeId: state.focusedNodeId,
      containerWidth: width,
      containerHeight: height,
      paperMap: state.paperMap,
      childMinSizes: new Map(childIds.map((id) => [id, getMinPaperSize(state.paperMap.get(id), config)])),
    });
  } catch {
    return null;
  }
  if (!result || typeof result !== 'object') return null;

  const finite = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);
  const shares = new Map<string, number>();
  const contentShare = contentEnabled ? finite(result.contentShare) : 0;
  if (contentShare > 0) shares.set(CONTENT_ID, contentShare);
  let assigned = contentShare;
  const unassigned: PaperId[] = [];
  for (const id of childIds) {
    const share = finite(result.childShares?.[id]);
    if (share > 0) {
      shares.set(id, share);
      assigned += share;
    } else {
      unassigned.push(id);
    }
  }
  const rest = Math.max(0, 1 - assigned);
  for (const id of unassigned) shares.set(id, rest > 0 ? rest / unassigned.length : 0);
  const total = Array.from(shares.values()).reduce((sum, v) => sum + v, 0);
  if (total <= 0) return null;
  for (const [id, share] of shares) shares.set(id, share / total);
  return shares;
}

/**
 * Splits one paper's room (`containerWidth` × `containerHeight`, header already taken off)
 * between its own content and its visible children.
 */
export function computeNodeLayout(
  nodeId: PaperId,
  containerWidth: number,
  containerHeight: number,
  state: LayoutState,
  config: PaperCanvasConfig,
  demand?: DemandSnapshot,
): NodeRoomLayout {
  const w = Math.max(0, containerWidth);
  const h = Math.max(0, containerHeight);
  const snapshot = demand ?? buildDemandSnapshot(state, config, nodeId);
  const parent = state.paperMap.get(nodeId);
  if (!parent) {
    return { contentRect: ZERO_RECT, childRects: new Map(), closedChildIds: [], crampedChildIds: [] };
  }

  const policyOf = (id: PaperId): NodeLayoutPolicy =>
    snapshot.policyMap.get(id)
    ?? deriveNodeLayoutPolicyFromVisibility(
      getVisibleChildIds(state.paperMap, state.expansionMap, id).length > 0,
      deriveNodeVisibilityState(id, state),
      config,
    );
  const policy = policyOf(nodeId);
  const visible = snapshot.visibleChildMap.get(nodeId)
    ?? (policy.childRoomEnabled ? getVisibleChildIds(state.paperMap, state.expansionMap, nodeId) : []);
  const visibleSet = new Set(visible);
  const closedChildIds = parent.childIds.filter((id) => !visibleSet.has(id));
  const fullContent: LayoutRect = { id: CONTENT_ID, x: 0, y: 0, width: w, height: h };

  if (w === 0 || h === 0 || visible.length === 0) {
    const childRects = new Map<PaperId, LayoutRect>();
    for (const id of visible) childRects.set(id, { id, x: 0, y: 0, width: 0, height: 0 });
    const cramped = visible.filter((id) => policyOf(id).reservesRoom);
    return {
      contentRect: policy.hasContent && visible.length === 0 ? fullContent : ZERO_RECT,
      childRects,
      closedChildIds,
      crampedChildIds: w === 0 || h === 0 ? cramped : [],
    };
  }

  const reserving = visible.filter((id) => policyOf(id).reservesRoom);
  const contentDemand = snapshot.contentDemandMap.get(nodeId) ?? 0;
  const childDemands = new Map(
    reserving.map((id) => [
      id,
      Math.max((snapshot.roomDemandMap.get(id) ?? 0) * importanceOf(state.paperMap.get(id)), ROOM_MIN_WEIGHT),
    ]),
  );
  const autoMinShare = getAutoOpenChildMinShare(reserving.length);
  const minShareOf = (id: PaperId) => Math.max(
    autoMinShare,
    Math.max(0, state.paperMap.get(id)?.pinnedLayout?.minShare ?? 0),
    Math.max(0, parent.childMinShares?.[id] ?? 0),
  );

  const fixedShares = customShares(parent, contentDemand > 0, reserving, w, h, state, config);

  const buildRects = (): LayoutRect[] => {
    let shares: Map<string, number>;
    let order: string[];
    if (fixedShares) {
      shares = fixedShares;
      order = [...(fixedShares.has(CONTENT_ID) ? [CONTENT_ID] : []), ...reserving];
    } else {
      const items: ShareInput[] = [
        ...(contentDemand > 0 ? [{ id: CONTENT_ID, demand: contentDemand, minShare: 0 }] : []),
        ...reserving.map((id) => ({ id, demand: childDemands.get(id) ?? ROOM_MIN_WEIGHT, minShare: minShareOf(id) })),
      ];
      shares = normalizeShares(items);
      order = items.map((item) => item.id);
    }
    return computeRoomLayout(
      order.map((id) => ({ id, weight: Math.max(shares.get(id) ?? 0, 0) })),
      w,
      h,
    ).rects;
  };

  let rects = buildRects();

  if (!fixedShares) {
    // Least important first: lowest attention, then least recently touched.
    const shrinkOrder = [...reserving].sort((a, b) => {
      const ra = snapshot.effectiveAttentionMap.get(a) ?? getEffectiveAttention(state, a, config);
      const rb = snapshot.effectiveAttentionMap.get(b) ?? getEffectiveAttention(state, b, config);
      if (ra !== rb) return ra - rb;
      return (state.accessMap.get(a) ?? 0) - (state.accessMap.get(b) ?? 0);
    });
    for (let pass = 0; pass < MAX_SHRINK_PASSES; pass += 1) {
      if (!rects.some((rect) => rect.id !== CONTENT_ID && outsideAspectRatio(rect, config))) break;
      const target = shrinkOrder.find((id) =>
        state.paperMap.get(id)?.pinnedLayout?.minShare === undefined
        && (childDemands.get(id) ?? ROOM_MIN_WEIGHT) > ROOM_MIN_WEIGHT);
      if (!target) break;
      const current = childDemands.get(target) ?? ROOM_MIN_WEIGHT;
      childDemands.set(target, Math.max(ROOM_MIN_WEIGHT, current * SHRINK_STEP));
      rects = buildRects();
    }
  }

  const snapped = new Map(snapRects(rects).map((rect) => [rect.id, rect]));
  const childRects = new Map<PaperId, LayoutRect>();
  const crampedChildIds: PaperId[] = [];
  for (const id of visible) {
    const rect = snapped.get(id);
    if (!rect) {
      childRects.set(id, { id, x: 0, y: 0, width: 0, height: 0 });
      continue;
    }
    childRects.set(id, rect);
    if (isCramped(rect, getMinPaperSize(state.paperMap.get(id), config), config)) crampedChildIds.push(id);
  }

  return {
    contentRect: snapped.get(CONTENT_ID) ?? ZERO_RECT,
    childRects,
    closedChildIds,
    crampedChildIds,
  };
}

function rectEqual(a: LayoutRect, b: LayoutRect): boolean {
  return a.id === b.id && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function idsEqual(a: readonly PaperId[], b: readonly PaperId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function childRectsEqual(a: Map<PaperId, LayoutRect>, b: Map<PaperId, LayoutRect>): boolean {
  if (a.size !== b.size) return false;
  const bEntries = b.entries();
  for (const [id, rect] of a) {
    const next = bEntries.next();
    if (next.done || next.value[0] !== id || !rectEqual(rect, next.value[1])) return false;
  }
  return true;
}

export function layoutEntryEqual(a: NodeLayoutEntry, b: NodeLayoutEntry): boolean {
  return a.policy === b.policy
    && rectEqual(a.allocatedRect, b.allocatedRect)
    && rectEqual(a.roomLayout.contentRect, b.roomLayout.contentRect)
    && childRectsEqual(a.roomLayout.childRects, b.roomLayout.childRects)
    && idsEqual(a.roomLayout.closedChildIds, b.roomLayout.closedChildIds)
    && idsEqual(a.roomLayout.crampedChildIds, b.roomLayout.crampedChildIds);
}

/**
 * Lays out every visible paper of the canvas. Entries equal to the ones in `previous` keep their
 * identity, so subscribers of unchanged papers do not re-render.
 */
export function computeCanvasLayout(
  state: LayoutState,
  config: PaperCanvasConfig,
  rootId: PaperId | null,
  size: CanvasSize,
  previous?: CanvasLayout | null,
): CanvasLayout {
  const width = Math.max(0, Math.round(size.width));
  const height = Math.max(0, Math.round(size.height));
  if (rootId === null || !state.paperMap.has(rootId) || width === 0 || height === 0) {
    return { rootId, width, height, entries: new Map(), demand: emptyDemand() };
  }

  const demand = buildDemandSnapshot(state, config, rootId);
  const entries = new Map<PaperId, NodeLayoutEntry>();
  const previousEntries = previous?.entries;

  const place = (id: PaperId, allocatedRect: LayoutRect) => {
    if (entries.has(id)) return;
    const policy = demand.policyMap.get(id);
    if (!policy) return;
    const roomW = Math.max(0, allocatedRect.width - config.paperNode.borderWidth);
    const roomH = Math.max(0, allocatedRect.height - policy.headerHeight - config.paperNode.borderWidth);
    const roomLayout = computeNodeLayout(id, roomW, roomH, state, config, demand);
    const next: NodeLayoutEntry = { allocatedRect, roomLayout, policy };
    const old = previousEntries?.get(id);
    entries.set(id, old && layoutEntryEqual(old, next) ? old : next);

    for (const [childId, childRect] of roomLayout.childRects) {
      const dividerTop = childRect.y > 0 ? CHILD_DIVIDER_PX : 0;
      place(childId, {
        id: childId,
        x: allocatedRect.x + childRect.x,
        y: allocatedRect.y + policy.headerHeight + childRect.y,
        width: Math.max(0, childRect.width - CHILD_DIVIDER_PX),
        height: Math.max(0, childRect.height - dividerTop),
      });
    }
  };

  place(rootId, { id: rootId, x: 0, y: 0, width, height });
  return { rootId, width, height, entries, demand };
}
