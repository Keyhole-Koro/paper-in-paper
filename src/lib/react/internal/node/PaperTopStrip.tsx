import { memo } from 'react';
import type { PaperId, PaperMap } from '../../../core/types';

interface Props {
  paperMap: PaperMap;
  contextId: PaperId;
  currentPathIds: PaperId[];
  getHue: (paperId: PaperId) => number | null;
  onChildClick: (childId: PaperId) => void;
  allowInteractions?: boolean;
}

export default memo(function PaperTopStrip({
  paperMap,
  contextId,
  currentPathIds,
  getHue,
  onChildClick,
  allowInteractions = true,
}: Props) {
  const context = paperMap.get(contextId);
  if (!context || context.childIds.length === 0) {
    return null;
  }

  return (
    <div className="paper-node__sibling-strip">
      {context.childIds.map((childId) => {
        const child = paperMap.get(childId)!;
        const hue = getHue(childId);
        const isActive = currentPathIds.includes(childId);
        const color = hue !== null ? `hsl(${hue}, 56%, ${isActive ? 26 : 34}%)` : isActive ? '#111118' : '#44445d';
        const background = hue !== null
          ? `hsla(${hue}, 56%, ${isActive ? 56 : 52}%, ${isActive ? 0.18 : 0.1})`
          : isActive
            ? 'rgba(17,17,24,0.08)'
            : 'rgba(17,17,24,0.05)';
        const borderColor = hue !== null
          ? `hsla(${hue}, 50%, 42%, ${isActive ? 0.36 : 0.22})`
          : isActive
            ? 'rgba(17,17,24,0.2)'
            : 'rgba(17,17,24,0.1)';

        return (
          <button
            key={childId}
            type="button"
            className={`paper-node__context-chip ${isActive ? 'paper-node__context-chip--active' : 'paper-node__context-chip--inactive'}`}
            style={{ color, background, borderColor }}
            onClick={allowInteractions ? (event) => {
              event.stopPropagation();
              onChildClick(childId);
            } : undefined}
            title={child.title}
            disabled={!allowInteractions}
          >
            <span className="paper-node__context-chip-title">{child.title}</span>
            {child.childIds.length > 0 && (
              <span className="paper-node__context-chip-count">{child.childIds.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
});
