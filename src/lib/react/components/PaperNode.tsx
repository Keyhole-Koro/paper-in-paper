import { useEffect, useRef } from 'react';
import type { PaperId } from '../../core/types';
import { usePaperStoreSelector } from '../context/PaperStoreContext';
import { useDrag } from '../context/DragContext';
import { useDebug } from '../context/DebugContext';
import { useLayoutEntry } from '../context/LayoutContext';
import type { PaperColorContext } from '../internal/paperColors';
import { derivePaperNodeRenderModel } from '../internal/paperNodeRenderModel';
import { PaperNodeFrame } from './PaperNodeFrame';
import { getEffectiveAttention } from '../../core/attention';

function shallowEqualNodeSelection(
  a: {
    config: any;
    paper: any;
    nodeIsIndexed: boolean;
    parentIsIndexed: boolean;
    isFocused: boolean;
    effectiveAttention: number;
    debugBadge: string | null;
  },
  b: {
    config: any;
    paper: any;
    nodeIsIndexed: boolean;
    parentIsIndexed: boolean;
    isFocused: boolean;
    effectiveAttention: number;
    debugBadge: string | null;
  },
) {
  return (
    a.config === b.config &&
    a.paper === b.paper &&
    a.nodeIsIndexed === b.nodeIsIndexed &&
    a.parentIsIndexed === b.parentIsIndexed &&
    a.isFocused === b.isFocused &&
    a.effectiveAttention === b.effectiveAttention &&
    a.debugBadge === b.debugBadge
  );
}

interface PaperNodeProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  inheritedColor?: PaperColorContext | null;
  overrideCss?: string;
}

export function PaperNode({ nodeId, parentId, inheritedColor = null, overrideCss }: PaperNodeProps) {
  const { session, insertTarget, registerRoom } = useDrag();
  const roomRef = useRef<HTMLDivElement>(null);
  const debug = useDebug();

  const entry = useLayoutEntry(nodeId);
  const parentEntry = useLayoutEntry(parentId);
  const { config, paper, nodeIsIndexed, parentIsIndexed, isFocused, effectiveAttention, debugBadge } = usePaperStoreSelector(
    ({ state, config }) => {
      const paper = state.paperMap.get(nodeId);
      const isFocused = state.focusedNodeId === nodeId;
      const nodeIsIndexed = state.indexedContentIds.has(nodeId);
      const parentIsIndexed = parentId ? state.indexedContentIds.has(parentId) : false;
      const effectiveAttention = getEffectiveAttention(state, nodeId, config, Date.now());
      return {
        config,
        paper,
        nodeIsIndexed,
        parentIsIndexed,
        isFocused,
        effectiveAttention,
        debugBadge:
          debug && paper
            ? `${nodeId} • att ${Math.round(effectiveAttention)} • ${entry?.allocatedRect.width ?? 0}×${entry?.allocatedRect.height ?? 0}`
            : null,
      };
    },
    shallowEqualNodeSelection,
  );

  useEffect(() => {
    registerRoom(nodeId, roomRef.current);
    return () => registerRoom(nodeId, null);
  }, [nodeId, registerRoom]);

  if (!paper) return null;

  const renderModel = derivePaperNodeRenderModel({
    nodeId,
    parentId,
    config,
    paper,
    entry,
    parentEntry,
    session,
    insertTarget,
    inheritedColor,
    isFocused,
    nodeIsIndexed,
    parentIsIndexed,
    effectiveAttention,
    debugBadge,
  });

  return (
    <PaperNodeFrame
      nodeId={nodeId}
      parentId={parentId}
      paper={renderModel.paper}
      layout={renderModel.layout}
      tone={renderModel.tone}
      inheritedColor={renderModel.inheritedColor}
      overrideCss={overrideCss}
      currentShare={renderModel.currentShare}
      isFocused={renderModel.isFocusedView}
      isDragTarget={renderModel.isDragTargetView}
      layoutPolicy={renderModel.view.layoutPolicy}
      debugBadge={renderModel.debugBadge}
      roomRef={roomRef}
      insertBeforeRect={renderModel.insertBeforeRect}
    />
  );
}
