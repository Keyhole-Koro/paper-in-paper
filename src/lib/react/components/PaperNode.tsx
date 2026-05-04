import { useEffect, useRef } from 'react';
import type { PaperId } from '../../core/types';
import { usePaperStore } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import { useDebug } from '../context/DebugContext';
import { useLayoutContext } from '../context/LayoutContext';
import type { RoomLayout } from '../hooks/usePaperLayout';
import { derivePaperNodeViewModel } from '../internal/paperNodeView';
import {
  getPaperTone,
  resolvePaperColorContext,
  type PaperColorContext,
} from '../internal/paperColors';
import { PaperNodeFrame } from './PaperNodeFrame';

const FALLBACK_LAYOUT: RoomLayout = {
  contentRect: { id: '__content__', x: 0, y: 0, width: 0, height: 0 },
  childRects: new Map(),
  closedChildIds: [],
};

interface PaperNodeProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  inheritedColor?: PaperColorContext | null;
  overrideCss?: string;
}

export function PaperNode({ nodeId, parentId, inheritedColor = null, overrideCss }: PaperNodeProps) {
  const { config, state } = usePaperStore();
  const { session, insertTarget, registerRoom } = useDrag();
  const roomRef = useRef<HTMLDivElement>(null);
  const debug = useDebug();

  const layoutMap = useLayoutContext();
  const entry = layoutMap.get(nodeId);
  const layout = entry?.roomLayout ?? FALLBACK_LAYOUT;
  const paper = state.paperMap.get(nodeId);
  const isRoot = parentId === null;

  useEffect(() => {
    registerRoom(nodeId, roomRef.current);
    return () => registerRoom(nodeId, null);
  }, [nodeId, registerRoom]);

  if (!paper) return null;

  const isFocused = state.focusedNodeId === nodeId;
  const isDragTarget = session !== null && insertTarget?.parentId === nodeId;
  const view = derivePaperNodeViewModel({
    nodeId,
    isRoot,
    entry,
    isFocused,
    isDragTarget,
    config: config.paperNode,
  });
  if (view.visibilityMode === 'hidden') return null;

  const color = resolvePaperColorContext(paper.hue, inheritedColor);
  const isFocusedView = view.interactionMode === 'focused';
  const isDragTargetView = view.interactionMode === 'drag-target';
  const tone = getPaperTone(color, { isRoot, isFocused: isFocusedView });

  const insertBeforeRect = isDragTarget && insertTarget?.insertBeforeId && layout.childRects.has(insertTarget.insertBeforeId)
    ? (() => {
        const rect = layout.childRects.get(insertTarget.insertBeforeId);
        return rect ? { x: rect.x, y: rect.y, height: rect.height } : null;
      })()
    : null;
  const debugBadge = debug
    ? `${nodeId} • imp ${Math.round(state.importanceMap.get(nodeId) ?? 0)} • ${entry?.allocatedRect.width ?? 0}×${entry?.allocatedRect.height ?? 0} • ${view.visibilityMode} • ${view.interactionMode}`
    : null;

  return (
    <PaperNodeFrame
      nodeId={nodeId}
      parentId={parentId}
      paper={paper}
      layout={layout}
      tone={tone}
      inheritedColor={color}
      overrideCss={overrideCss}
      isFocused={isFocusedView}
      isDragTarget={isDragTargetView}
      debugBadge={debugBadge}
      roomRef={roomRef}
      insertBeforeRect={insertBeforeRect}
    />
  );
}
