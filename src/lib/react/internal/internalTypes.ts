import type { PaperId } from '../../core/types';

export interface DragState {
  paperId: PaperId | null;
  parentId: PaperId | null;
  returnParentId: PaperId | null;
  point: { x: number; y: number } | null;
}

export interface FloatingPlacement {
  mode: 'floating';
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: PaperId;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  isPrimary: boolean;
}

export type PlacementMap = Map<PaperId, FloatingPlacement>;

export interface FloatMeta {
  parentId: PaperId;
  depth: number;
  crumbs: PaperId[];
  hue: number | null;
  isPrimary: boolean;
  nodeStartRect: DOMRect | null;
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
