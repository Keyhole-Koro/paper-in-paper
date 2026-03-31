export type PaperId = string;

export interface Paper {
  id: PaperId;
  title: string;
  body: string;
  childIds: PaperId[];
  parentId: PaperId | null;
}

export type PaperMap = Map<PaperId, Paper>;

export interface NodeExpansion {
  openChildIds: PaperId[];
  primaryChildId: PaperId | null;
}

export type ExpansionMap = Map<PaperId, NodeExpansion>;
