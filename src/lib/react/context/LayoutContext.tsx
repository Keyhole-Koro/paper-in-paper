import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { PaperId } from '../../core/types';
import type { LayoutRect } from '../internal/roomLayout';
import type { RoomLayout } from '../hooks/usePaperLayout';

export interface NodeLayoutEntry {
  allocatedRect: LayoutRect;
  roomLayout: RoomLayout;
}

const LayoutContext = createContext<Map<PaperId, NodeLayoutEntry>>(new Map());

export function LayoutContextProvider({
  layoutMap,
  children,
}: {
  layoutMap: Map<PaperId, NodeLayoutEntry>;
  children: ReactNode;
}) {
  return <LayoutContext.Provider value={layoutMap}>{children}</LayoutContext.Provider>;
}

export function useLayoutContext(): Map<PaperId, NodeLayoutEntry> {
  return useContext(LayoutContext);
}
