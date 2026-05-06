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
import type { NodeVisibilityState } from '../../core/nodeVisibility';
import { deriveNodeVisibilityState } from '../../core/nodeVisibility';

function shallowEqualNodeSelection(
  a: {
    config: any;
    paper: any;
    nodeVisibility: NodeVisibilityState;
    parentVisibility: NodeVisibilityState | null;
    isFocused: boolean;
    effectiveAttention: number;
  },
  b: {
    config: any;
    paper: any;
    nodeVisibility: NodeVisibilityState;
    parentVisibility: NodeVisibilityState | null;
    isFocused: boolean;
    effectiveAttention: number;
  },
) {
  return (
    a.config === b.config &&
    a.paper === b.paper &&
    a.nodeVisibility === b.nodeVisibility &&
    a.parentVisibility === b.parentVisibility &&
    a.isFocused === b.isFocused &&
    a.effectiveAttention === b.effectiveAttention
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
  const { config, paper, nodeVisibility, parentVisibility, isFocused, effectiveAttention } = usePaperStoreSelector(
    ({ state, config }) => {
      const paper = state.paperMap.get(nodeId);
      const isFocused = state.focusedNodeId === nodeId;
      const nodeVisibility = deriveNodeVisibilityState(nodeId, state);
      const parentVisibility = parentId ? deriveNodeVisibilityState(parentId, state) : null;
      const effectiveAttention = getEffectiveAttention(state, nodeId, config, Date.now());
      return {
        config,
        paper,
        nodeVisibility,
        parentVisibility,
        isFocused,
        effectiveAttention,
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
    nodeVisibility,
    parentVisibility,
    effectiveAttention,
    debug,
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
