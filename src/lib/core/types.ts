import type { ReactNode } from 'react';

export type PaperId = string;

// --- Structured content nodes (LLM-friendly, JSON-serializable) ---

export type ContentNode =
  | { type: 'text';       value: string }
  | { type: 'paragraph';  children: ContentNode[] }
  | { type: 'bold';       children: ContentNode[] }
  | { type: 'paper-link'; paperId: PaperId; label: string }
  | { type: 'card';       paperId: PaperId; title: string; description: string }
  | { type: 'section';    title?: string; children: ContentNode[] }
  | { type: 'list';       items: ContentNode[][] }
  | { type: 'table';      headers: string[]; rows: string[][] }
  | { type: 'callout';    children: ContentNode[] }

// ---------------------------------------------------------------

export type PaperContent = string | ReactNode | ContentNode[];

export interface MinSize {
  w: number;
  h: number;
}

export interface PaperLayoutContext {
  /** The paper's open children, in layout order. */
  openChildIds: PaperId[];
  focusedNodeId: PaperId | null;
  containerWidth: number;
  containerHeight: number;
  /** For layout functions that need to look at ancestors or descendants. */
  paperMap: PaperMap;
  /** The smallest size each open child should get (its minWidth/minHeight or the config default). */
  childMinSizes: Map<PaperId, MinSize>;
}

export interface PaperLayoutResult {
  /** Share of the room for the paper's own content (0–1). */
  contentShare: number;
  /** Share per child (0–1). Children left out split what remains equally. */
  childShares: Record<PaperId, number>;
}

export type PaperLayoutFn = (ctx: PaperLayoutContext) => PaperLayoutResult;

export interface PinnedLayout {
  minShare?: number;
  /** Logical clock value when the paper was pinned. */
  pinnedAt?: number;
}

export interface Paper {
  id: PaperId;
  title: string;
  description: string;
  content: PaperContent;
  hue?: number;
  /** HSL saturation factor (default 1). 0 renders the paper neutral (white–grey) whatever its hue. Children inherit it. */
  saturationScale?: number;
  /** Weight of this paper among its open siblings (default 1). */
  importance?: number;
  /** Weight of the paper's own content against its open children, in percent (default 100). */
  contentImportance?: number;
  /** Minimum share (0–1) per open child. */
  childMinShares?: Record<PaperId, number>;
  /** Custom split of this paper's room. Takes precedence over contentImportance and childMinShares. */
  layout?: PaperLayoutFn;
  /** Narrowest this paper should get while open, in px (defaults to config.layout.minPaperWidth). */
  minWidth?: number;
  /** Shortest this paper should get while open, in px (defaults to config.layout.minPaperHeight). */
  minHeight?: number;
  attentionScore?: number;
  pinnedLayout?: PinnedLayout;
  parentId: PaperId | null;
  childIds: PaperId[];
  overrideCss?: string;
}

export type PaperMap = Map<PaperId, Paper>;

export interface NodeExpansion {
  openChildIds: PaperId[];
  /** Mirror of openChildIds for O(1) membership checks. Internal optimization; must stay in sync. */
  openChildSet?: ReadonlySet<PaperId>;
}

/**
 * Open children per parent. The order of `openChildIds` is the order the children are laid out
 * in. Entries may name papers that are not in the paper map yet (restored state); they take
 * effect when the papers arrive.
 */
export type ExpansionMap = Map<PaperId, NodeExpansion>;

export type UnplacedNodeIds = PaperId[];

export type AttentionMap = Map<PaperId, number>;
/** Logical clock value at which each paper's attention was last set. */
export type AttentionTimestampMap = Map<PaperId, number>;
/** Logical clock value of each paper's last interaction. */
export type AccessMap = Map<PaperId, number>;

export interface PaperViewState {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
  indexedContentIds: Set<PaperId>;
  unplacedNodeIds: PaperId[];
  focusedNodeId: PaperId | null;
  /** Logical clock: advances by one on every interaction that touches a paper. */
  clock: number;
  attentionMap: AttentionMap;
  attentionTimestampMap: AttentionTimestampMap;
  accessMap: AccessMap;
  /** Clock value until which space management leaves a paper alone. */
  protectedUntilMap: Map<PaperId, number>;
}
