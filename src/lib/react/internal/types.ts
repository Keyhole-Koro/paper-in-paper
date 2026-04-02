import type { PaperId } from '../../core/types';

export interface InsertTarget {
  kind: 'gap' | 'surface';
  parentId: PaperId;
  insertBeforeId: PaperId | null;
}

export interface DragState {
  paperId: PaperId | null;
  parentId: PaperId | null;
  insertTarget: InsertTarget | null;
  point: { x: number; y: number } | null;
}

export interface SidebarPlacement {
  mode: 'sidebar';
  parentId: PaperId;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  isPrimary: boolean;
}

export type SidebarMap = Map<PaperId, SidebarPlacement>;
