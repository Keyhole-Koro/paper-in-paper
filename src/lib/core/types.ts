export type PaperId = string;

export interface Paper {
  id: PaperId;
  title: string;
  description: string;
  content: string;
  hue?: number;
  parentId: PaperId | null;
  childIds: PaperId[];
}

export type PaperMap = Map<PaperId, Paper>;

export interface NodeExpansion {
  openChildIds: PaperId[];
}

export type ExpansionMap = Map<PaperId, NodeExpansion>;

export type UnplacedNodeIds = PaperId[];

export type AccessMap = Map<PaperId, number>;

export type ImportanceMap = Map<PaperId, number>;

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
  unplacedNodeIds: PaperId[];
  focusedNodeId: PaperId | null;
  accessMap: AccessMap;
  importanceMap: ImportanceMap;
  manualPlacementMap: PlacementMap;
  contentHeightMap: Map<PaperId, number>;
  committedHeightMap: Map<PaperId, number>;
  protectedUntilMap: Map<PaperId, number>;
}
