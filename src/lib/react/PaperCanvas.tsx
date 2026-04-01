import { LayoutGroup } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanInfo } from 'framer-motion';
import type { PaperId, PaperMap } from '../core/types';
import { findRootId } from '../core/tree';
import PaperNode from './internal/PaperNode';
import FloatingLayer from './internal/FloatingLayer';
import Sidebar from './internal/Sidebar';
import { StoreProvider, useStore } from './internal/store';
import type { DragState, PlacementMap, FloatMeta, SidebarMap, SidebarPlacement } from './internal/internalTypes';
import { debugLog } from './internal/debugLog';
import {
  getAllOpenNodeIds,
  findParentOfOpen,
  isNodeVisible,
  computeCrumbs,
  getBranchHue,
} from './internal/paperNodeHelpers';

interface Props {
  paperMap: PaperMap;
  rootId?: PaperId;
}

interface ContentProps {
  rootId: PaperId;
}

function PaperCanvasContent({ rootId }: ContentProps) {
  const { state, dispatch } = useStore();
  const [selectedContextId, setSelectedContextId] = useState<PaperId | null>(null);
  const [floatingSelectedContextId, setFloatingSelectedContextId] = useState<PaperId | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    paperId: null,
    parentId: null,
    insertTarget: null,
    point: null,
  });
  const [placementMap, setPlacementMap] = useState<PlacementMap>(new Map());
  const [sidebarMap, setSidebarMap] = useState<SidebarMap>(new Map());
  const [lruOrder, setLruOrder] = useState<PaperId[]>([]);
  const [maxOpenNodes, setMaxOpenNodes] = useState<number>(8);
  const [floatingFocusId, setFloatingFocusId] = useState<PaperId | null>(null);
  const [floatingHighlightId, setFloatingHighlightId] = useState<PaperId | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const prevOpenIdsRef = useRef<Set<PaperId>>(new Set());
  const lruOrderRef = useRef<PaperId[]>([]);
  const placementMapRef = useRef<PlacementMap>(new Map());

  // Keep refs in sync for use inside effects with intentionally limited deps
  useEffect(() => { lruOrderRef.current = lruOrder; }, [lruOrder]);
  useEffect(() => { placementMapRef.current = placementMap; }, [placementMap]);

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

  // LRU Effect B — move selectedContextId and all its ancestors to front
  useEffect(() => {
    if (!selectedContextId) return;
    const ancestors = computeCrumbs(selectedContextId, state.paperMap);
    const toPromote = [selectedContextId, ...ancestors];
    setLruOrder((prev) => [
      ...toPromote.filter((id) => prev.includes(id)),
      ...prev.filter((id) => !toPromote.includes(id)),
    ]);
  }, [selectedContextId]); // state.paperMap is stable reference; intentionally not in deps

  // Eviction — when open count exceeds maxOpenNodes, evict oldest to sidebar
  useEffect(() => {
    const openIds = getAllOpenNodeIds(state.expansionMap);
    if (openIds.length <= maxOpenNodes) return;
    const openSet = new Set(openIds);
    const candidates = [...lruOrderRef.current]
      .reverse()
      .filter((id) => openSet.has(id) && !placementMapRef.current.has(id));
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
  }, [state.expansionMap, maxOpenNodes]); // lruOrderRef + placementMapRef accessed via refs

  const handleReturnFromSidebar = useCallback((paperId: PaperId) => {
    debugLog('sidebar-return', { paperId });
    setSidebarMap((prev) => {
      const m = new Map(prev);
      m.delete(paperId);
      return m;
    });
    // Read current sidebarMap snapshot before state update flushes
    const placement = sidebarMap.get(paperId);
    if (!placement) return;
    const parentVisible = isNodeVisible(placement.parentId, rootId, state.expansionMap);
    if (parentVisible) {
      dispatch({ type: 'OPEN', parentId: placement.parentId, childId: paperId });
    } else {
      setPlacementMap((prev) => {
        const m = new Map(prev);
        m.set(paperId, {
          mode: 'floating',
          x: 40 + prev.size * 20,
          y: 40 + prev.size * 20,
          width: 320,
          height: 200,
          parentId: placement.parentId,
          depth: placement.depth,
          crumbs: placement.crumbs,
          hue: placement.hue,
          isPrimary: placement.isPrimary,
        });
        return m;
      });
    }
    setLruOrder((prev) => [paperId, ...prev.filter((id) => id !== paperId)]);
  }, [sidebarMap, state.expansionMap, rootId, dispatch]);

  const handleInsertDrop = useCallback((paperId: PaperId, parentId: PaperId, insertBeforeId: PaperId | null) => {
    debugLog('insert-drop-dispatch', { paperId, parentId, insertBeforeId });
    dispatch({ type: 'REORDER', parentId, childId: paperId, insertBeforeId });
    dispatch({ type: 'OPEN', parentId, childId: paperId });
  }, [dispatch]);

  const handleFocusFloating = useCallback((paperId: PaperId) => {
    setFloatingFocusId(paperId);
    setFloatingHighlightId(paperId);
    window.setTimeout(() => setFloatingHighlightId(null), 700);
  }, []);

  const handleCancelFloatPreview = useCallback((paperId: PaperId) => {
    setPlacementMap((prev) => {
      if (!prev.has(paperId)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(paperId);
      return next;
    });
  }, []);

  const handleRequestFloat = useCallback((paperId: PaperId, info: PanInfo, meta: FloatMeta) => {
    const { nodeStartRect, ...placementMeta } = meta;
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    debugLog('request-float', {
      paperId,
      parentId: meta.parentId,
      offset: { x: info.offset.x, y: info.offset.y },
      depth: meta.depth,
      isPrimary: meta.isPrimary,
    });
    setPlacementMap((prev) => {
      const existing = prev.get(paperId);
      let x: number, y: number, width: number, height: number;
      if (existing) {
        if (nodeStartRect && canvasRect) {
          x = nodeStartRect.left - canvasRect.left + info.offset.x;
          y = nodeStartRect.top - canvasRect.top + info.offset.y;
        } else {
          x = existing.x + info.offset.x;
          y = existing.y + info.offset.y;
        }
        width = existing.width;
        height = existing.height;
      } else if (nodeStartRect && canvasRect) {
        x = nodeStartRect.left - canvasRect.left + info.offset.x;
        y = nodeStartRect.top - canvasRect.top + info.offset.y;
        width = nodeStartRect.width;
        height = nodeStartRect.height;
      } else {
        x = info.offset.x;
        y = info.offset.y;
        width = 320;
        height = 160;
      }
      const next = new Map(prev);
      next.set(paperId, { mode: 'floating', x, y, width, height, ...placementMeta });
      debugLog('placement-map-set', {
        paperId,
        parentId: placementMeta.parentId,
        x,
        y,
        width,
        height,
        size: next.size,
      });
      return next;
    });
  }, []);

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
          selectedContextId={selectedContextId}
          onSelectContext={setSelectedContextId}
          dragState={dragState}
          onDragStateChange={setDragState}
          placementMap={placementMap}
          onRequestFloat={handleRequestFloat}
          onCancelFloatPreview={handleCancelFloatPreview}
          onFocusFloating={handleFocusFloating}
        />
      </div>
      <FloatingLayer
        placementMap={placementMap}
        dragState={dragState}
        focusId={floatingFocusId}
        highlightId={floatingHighlightId}
        onFocus={setFloatingFocusId}
        selectedContextId={floatingSelectedContextId}
        onSelectContext={setFloatingSelectedContextId}
        onDragStateChange={setDragState}
        onPlacementMapChange={setPlacementMap}
        onInsertDrop={handleInsertDrop}
      />
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
