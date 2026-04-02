import { useMemo, useRef } from 'react';
import type { DragState } from '../types';
import { findInsertIndicatorRect } from './returnTarget';

interface Props {
  dragState: DragState;
}

export default function FloatingLayer({ dragState }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const insertIndicatorStyle = useMemo(() => {
    if (dragState.paperId === null || dragState.insertTarget === null) {
      return null;
    }

    const indicatorRect = findInsertIndicatorRect(dragState.insertTarget);
    const layerRect = layerRef.current?.getBoundingClientRect();
    if (!indicatorRect || !layerRect) {
      return null;
    }

    return {
      kind: indicatorRect.kind,
      left: indicatorRect.left - layerRect.left - (indicatorRect.kind === 'gap' ? 4 : 0),
      top: indicatorRect.top - layerRect.top,
      width: indicatorRect.width,
      height: indicatorRect.height,
    };
  }, [dragState.paperId, dragState.insertTarget, dragState.point]);

  return (
    <div className="paper-floating-layer" ref={layerRef}>
      {insertIndicatorStyle && (
        <div
          className={`paper-insert-indicator paper-insert-indicator--${insertIndicatorStyle.kind}`}
          style={{
            left: insertIndicatorStyle.left,
            top: insertIndicatorStyle.top,
            width: insertIndicatorStyle.kind === 'surface' ? insertIndicatorStyle.width : undefined,
            height: insertIndicatorStyle.height,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
