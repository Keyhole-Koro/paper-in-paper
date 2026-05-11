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
  openChildIds: PaperId[];
  focusedNodeId: PaperId | null;
  containerWidth: number;
  containerHeight: number;
  /** layout関数から祖先・子孫の関係を判定したい時用。 */
  paperMap: PaperMap;
  /** 各 open child が表示に必要とする最小サイズ。ボトムアップに集計される。 */
  childMinSizes: Map<PaperId, MinSize>;
}

export interface PaperLayoutResult {
  /** content area の比率（0〜1）。content + 全子shareの合計は1になることを期待。 */
  contentShare: number;
  /** 子ごとのshare（0〜1）。指定されない子は残り share を均等分配。 */
  childShares: Record<PaperId, number>;
}

export type PaperLayoutFn = (ctx: PaperLayoutContext) => PaperLayoutResult;

export interface Paper {
  id: PaperId;
  title: string;
  description: string;
  content: PaperContent;
  hue?: number;
  importance?: number;
  /** content area が children area に対して占めるweight。デフォルト100。 */
  contentImportance?: number;
  /** 子ノードごとの最小share（0〜1）。子同士の間で計算される。余りがあれば1まで拡張される。 */
  childMinShares?: Record<PaperId, number>;
  /** カスタムレイアウト関数。指定された場合はchildMinShares/contentImportanceより優先される。 */
  layout?: PaperLayoutFn;
  /** content を表示するのに最低必要な幅（px）。auto-collapse 判定に使われる。 */
  minWidth?: number;
  /** content を表示するのに最低必要な高さ（px）。auto-collapse 判定に使われる。 */
  minHeight?: number;
  parentId: PaperId | null;
  childIds: PaperId[];
  overrideCss?: string;
}

export type PaperMap = Map<PaperId, Paper>;

export interface NodeExpansion {
  openChildIds: PaperId[];
}

export type ExpansionMap = Map<PaperId, NodeExpansion>;

export type UnplacedNodeIds = PaperId[];

export interface GridPosition {
  x: number;
  y: number;
}

export interface ManualPlacement {
  positions: Map<PaperId, GridPosition>;
}

export type PlacementMap = Map<PaperId, ManualPlacement>;

export type AccessMap = Map<PaperId, number>;
export type ImportanceMap = Map<PaperId, number>;

export interface PaperViewState {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
  indexedContentIds: Set<PaperId>;
  unplacedNodeIds: PaperId[];
  focusedNodeId: PaperId | null;
  accessMap: AccessMap;
  importanceMap: ImportanceMap;
  manualPlacementMap: PlacementMap;
  contentHeightMap: Map<PaperId, number>;
  protectedUntilMap: Map<PaperId, number>;
}
