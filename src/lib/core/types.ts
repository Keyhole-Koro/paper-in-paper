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

export interface PinnedLayout {
  minShare?: number;
  pinnedAt?: number;
}

export interface Paper {
  id: PaperId;
  title: string;
  description: string;
  content: PaperContent;
  hue?: number;
  attentionScore?: number;
  pinnedLayout?: PinnedLayout;
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

export type AccessMap = Map<PaperId, number>;

export type AttentionMap = Map<PaperId, number>;
export type AttentionTimestampMap = Map<PaperId, number>;

export interface GridPosition {
  x: number;
  y: number;
}

export interface ManualPlacement {
  positions: Map<PaperId, GridPosition>;
}

export type PlacementMap = Map<PaperId, ManualPlacement>;

export interface PaperViewState {
  paperMap: PaperMap;
  expansionMap: ExpansionMap;
  indexedContentIds: Set<PaperId>;
  unplacedNodeIds: PaperId[];
  focusedNodeId: PaperId | null;
  accessMap: AccessMap;
  attentionMap: AttentionMap;
  attentionTimestampMap: AttentionTimestampMap;
  manualPlacementMap: PlacementMap;
  contentHeightMap: Map<PaperId, number>;
  protectedUntilMap: Map<PaperId, number>;
}
