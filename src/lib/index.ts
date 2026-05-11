export { PaperCanvas } from './react/PaperCanvas';
export type { PaperCanvasProps, PaperCanvasHandle } from './react/PaperCanvas';
export type { PaperCanvasConfig, PaperCanvasConfigInput, PaperNodeConfig, ImportanceConfig } from './config/paperCanvasConfig';
export { defaultPaperCanvasConfig, resolvePaperCanvasConfig } from './config/paperCanvasConfig';
export type {
  AccessMap,
  ContentNode,
  ExpansionMap,
  ImportanceMap,
  MinSize,
  Paper,
  PaperContent,
  PaperId,
  PaperLayoutContext,
  PaperLayoutFn,
  PaperLayoutResult,
  PaperMap,
  PaperViewState,
} from './core/types';
export { buildPaperMap } from './core/tree';
export type { RemoveMode } from './core/tree';
export { createInitialState, reduce } from './core/commands';
export type { Command } from './core/commands';
export { usePaperStore } from './react/context/PaperStoreContext';

import type { ExpansionMap, PaperId } from './core/types';
export interface DefaultOpenState {
  expansionMap: ExpansionMap;
  focusedNodeId: PaperId | null;
}
