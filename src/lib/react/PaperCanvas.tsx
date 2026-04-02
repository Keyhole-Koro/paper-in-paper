import { LayoutGroup } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaperId, PaperMap } from '../core/types';
import { findRootId } from '../core/tree';
import PaperNode from './internal/node/PaperNode';
import FloatingLayer from './internal/drag/FloatingLayer';
import Sidebar from './internal/sidebar/Sidebar';
import { StoreProvider, useStore } from './internal/state/store';
import type { DragState, SidebarMap, SidebarPlacement } from './internal/types';
import { debugLog } from './internal/drag/debugLog';
import {
  getAllOpenNodeIds,
  findParentOfOpen,
  computeCrumbs,
  getBranchHue,
} from './internal/node/paperNodeHelpers';

interface Props {
  paperMap: PaperMap;
  rootId?: PaperId;
}

interface ContentProps {
  rootId: PaperId;
}

function PaperCanvasContent({ rootId }: ContentProps) {
  const { state, dispatch } = useStore();
  const [dragState, setDragState] = useState<DragState>({
    paperId: null,
    parentId: null,
    insertTarget: null,
    point: null,
  });
  const [sidebarMap, setSidebarMap] = useState<SidebarMap>(new Map());
  const [lruOrder, setLruOrder] = useState<PaperId[]>([]);
  const [maxOpenNodes, setMaxOpenNodes] = useState<number>(8);
  const canvasRef = useRef<HTMLDivElement>(null);
  const prevOpenIdsRef = useRef<Set<PaperId>>(new Set());
  const lruOrderRef = useRef<PaperId[]>([]);

  useEffect(() => { lruOrderRef.current = lruOrder; }, [lruOrder]);

  // ResizeObserver — update maxOpenNodes based on canvas width
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = (width: number) => {
      if (width < 800) setMaxOpenNodes(3);
      else if (width < 1200) setMaxOpenNodes(5);
      else setMaxOpenNodes(8);
    };
    const ro = new ResizeObserver((entries) => update(entries[0].contentRect.width));
    ro.observe(el);
    update(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // LRU Effect A — detect newly opened / closed nodes
  useEffect(() => {
    const current = new Set(getAllOpenNodeIds(state.expansionMap));
    const newlyOpened = [...current].filter((id) => !prevOpenIdsRef.current.has(id));
    const removed = [...prevOpenIdsRef.current].filter(
      (id) => !current.has(id) && !sidebarMap.has(id),
    );
    prevOpenIdsRef.current = current;
    if (!newlyOpened.length && !removed.length) return;
    setLruOrder((prev) => [
      ...newlyOpened,
      ...prev.filter((id) => !removed.includes(id)),
    ]);
  }, [state.expansionMap]); // sidebarMap read as snapshot — intentionally not in deps

  // Eviction — when open count exceeds maxOpenNodes, evict oldest to sidebar
  useEffect(() => {
    const openIds = getAllOpenNodeIds(state.expansionMap);
    if (openIds.length <= maxOpenNodes) return;
    const openSet = new Set(openIds);
    const candidates = [...lruOrderRef.current]
      .reverse()
      .filter((id) => openSet.has(id));
    const toEvict = candidates.slice(0, openIds.length - maxOpenNodes);
    if (!toEvict.length) return;

    const newEntries: [PaperId, SidebarPlacement][] = [];
    for (const childId of toEvict) {
      const parentId = findParentOfOpen(childId, state.expansionMap);
      if (!parentId) continue;
      const crumbs = computeCrumbs(childId, state.paperMap);
      newEntries.push([childId, {
        mode: 'sidebar',
        parentId,
        crumbs,
        depth: crumbs.length + 1,
        hue: getBranchHue(state.paperMap, childId, rootId),
        isPrimary: state.expansionMap.get(parentId)?.primaryChildId === childId,
      }]);
      dispatch({ type: 'CLOSE', childId, parentId });
    }
    if (newEntries.length) {
      setSidebarMap((prev) => {
        const m = new Map(prev);
        newEntries.forEach(([k, v]) => m.set(k, v));
        return m;
      });
    }
  }, [state.expansionMap, maxOpenNodes]); // lruOrderRef accessed via ref

  const handleReturnFromSidebar = useCallback((paperId: PaperId) => {
    debugLog('sidebar-return', { paperId });
    setSidebarMap((prev) => {
      const m = new Map(prev);
      m.delete(paperId);
      return m;
    });
    const placement = sidebarMap.get(paperId);
    if (!placement) return;
    dispatch({ type: 'OPEN', parentId: placement.parentId, childId: paperId });
    setLruOrder((prev) => [paperId, ...prev.filter((id) => id !== paperId)]);
  }, [sidebarMap, dispatch]);

  const handleInsertDrop = useCallback((paperId: PaperId, parentId: PaperId, insertBeforeId: PaperId | null) => {
    debugLog('insert-drop-dispatch', { paperId, parentId, insertBeforeId });
    dispatch({ type: 'REORDER', parentId, childId: paperId, insertBeforeId });
    dispatch({ type: 'OPEN', parentId, childId: paperId });
  }, [dispatch]);

  return (
    <div className="paper-canvas" ref={canvasRef}>
      <Sidebar
        sidebarMap={sidebarMap}
        paperMap={state.paperMap}
        onReturn={handleReturnFromSidebar}
      />
      <div className="paper-universe">
        <PaperNode
          paperId={rootId}
          parentId={null}
          isPrimary={true}
          depth={0}
          crumbs={[]}
          hue={null}
          dragState={dragState}
          onDragStateChange={setDragState}
          onInsertDrop={handleInsertDrop}
        />
      </div>
      <FloatingLayer dragState={dragState} />
    </div>
  );
}

export default function PaperCanvas({ paperMap, rootId }: Props) {
  const resolvedRootId = rootId ?? findRootId(paperMap);

  if (!resolvedRootId) {
    throw new Error('PaperCanvas requires a root node.');
  }

  return (
    <StoreProvider paperMap={paperMap}>
      <LayoutGroup>
        <PaperCanvasContent rootId={resolvedRootId} />
      </LayoutGroup>
    </StoreProvider>
  );
}
