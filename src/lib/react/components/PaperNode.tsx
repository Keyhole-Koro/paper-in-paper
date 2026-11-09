import { memo, useMemo } from 'react';
import type { PaperId } from '../../core/types';
import { useCanvasOptions } from '../context/CanvasOptionsContext';
import { getPaperTone, resolvePaperColorContext, type PaperColorContext } from '../internal/paperColors';
import { useLayoutEntry, useStoreValue } from '../store/storeContext';
import { PaperNodeFrame } from './PaperNodeFrame';

interface PaperNodeProps {
  nodeId: PaperId;
  parentId: PaperId | null;
  inheritedColor: PaperColorContext | null;
}

/**
 * One paper. Subscribes to its own layout entry, its paper record and whether it is focused —
 * nothing else — so a change elsewhere in the tree does not re-render it.
 */
export const PaperNode = memo(function PaperNode({ nodeId, parentId, inheritedColor }: PaperNodeProps) {
  const entry = useLayoutEntry(nodeId);
  const paper = useStoreValue((snapshot) => snapshot.state.paperMap.get(nodeId));
  const isFocused = useStoreValue((snapshot) => snapshot.state.focusedNodeId === nodeId);
  const headerHeight = useStoreValue((snapshot) => snapshot.config.paperNode.headerHeight);
  const { colorScheme } = useCanvasOptions();

  const hue = paper?.hue;
  const saturationScale = paper?.saturationScale;
  const color = useMemo(
    () => resolvePaperColorContext(hue, inheritedColor, saturationScale),
    [hue, saturationScale, inheritedColor],
  );
  const tone = useMemo(
    () => getPaperTone(color, { isRoot: parentId === null, isFocused, scheme: colorScheme }),
    [color, parentId, isFocused, colorScheme],
  );

  if (!paper || !entry) return null;
  return (
    <PaperNodeFrame
      nodeId={nodeId}
      parentId={parentId}
      paper={paper}
      entry={entry}
      tone={tone}
      color={color}
      isFocused={isFocused}
      headerHeight={headerHeight}
    />
  );
});
