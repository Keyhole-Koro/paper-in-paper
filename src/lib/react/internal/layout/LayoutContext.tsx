/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ExpansionMap, PaperId } from '../../../core/types';
import {
  computeAutoLayout,
  type AccessMap,
  type NodeSize,
} from '../node/utils/layoutHelpers';

interface LayoutContextValue {
  getSize: (paperId: PaperId) => NodeSize;
  onAccess: (paperId: PaperId) => void;
  onResize: (paperId: PaperId, size: NodeSize) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  getSize: () => 'md',
  onAccess: () => {},
  onResize: () => {},
});

export function useLayout(): LayoutContextValue {
  return useContext(LayoutContext);
}

interface Props {
  children: React.ReactNode;
  expansionMap: ExpansionMap;
  layoutHints?: Map<PaperId, NodeSize>;
  onLayoutChange?: (layout: Map<PaperId, NodeSize>) => void;
  onAccessMapChange?: (accessMap: AccessMap) => void;
}

export function LayoutProvider({ children, expansionMap, layoutHints, onLayoutChange, onAccessMapChange }: Props) {
  const [accessMap, setAccessMap] = useState<AccessMap>(new Map());
  const [lockedSizes, setLockedSizes] = useState<Map<PaperId, NodeSize>>(new Map());

  // Collect all currently open node IDs
  const allOpenIds = useMemo(() => {
    const ids = new Set<PaperId>();
    for (const { openChildIds } of expansionMap.values()) {
      for (const id of openChildIds) ids.add(id);
    }
    return [...ids];
  }, [expansionMap]);

  // Derived layout: LRU auto < external hints < user-locked
  const computedLayout = useMemo(() => {
    const layout = computeAutoLayout(allOpenIds, accessMap, lockedSizes);
    if (layoutHints) {
      for (const [id, size] of layoutHints) {
        if (!lockedSizes.has(id)) {
          layout.set(id, size);
        }
      }
    }
    return layout;
  }, [allOpenIds, accessMap, lockedSizes, layoutHints]);

  // Notify external listener when layout changes
  const prevLayoutRef = useRef<Map<PaperId, NodeSize>>(new Map());
  useEffect(() => {
    if (!onLayoutChange) return;
    prevLayoutRef.current = computedLayout;
    onLayoutChange(computedLayout);
  }, [computedLayout, onLayoutChange]);

  useEffect(() => {
    if (!onAccessMapChange) return;
    onAccessMapChange(accessMap);
  }, [accessMap, onAccessMapChange]);

  const getSize = useCallback(
    (paperId: PaperId): NodeSize => computedLayout.get(paperId) ?? 'md',
    [computedLayout],
  );

  const onAccess = useCallback((paperId: PaperId) => {
    setAccessMap((prev) => new Map(prev).set(paperId, Date.now()));
  }, []);

  const onResize = useCallback((paperId: PaperId, size: NodeSize) => {
    setLockedSizes((prev) => new Map(prev).set(paperId, size));
  }, []);

  const value = useMemo(
    () => ({ getSize, onAccess, onResize }),
    [getSize, onAccess, onResize],
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}
